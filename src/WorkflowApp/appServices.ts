import * as readline from 'readline';
import { log } from '../test/helpers/BPMNTester';
import axios from 'axios';
import { group } from 'console';

const cl = readline.createInterface(process.stdin, process.stdout);
const question = function (q) {
    return new Promise((res, rej) => {
        cl.question(q, answer => {
            res(answer);
        })
    });
};
async function delay(time, result?) {
    console.log("delaying ... " + time)
    return new Promise(function (resolve) {
        setTimeout(function () {
            console.log("delayed is done.");
            resolve(result);
        }, time);
    });
}

class AppServices {
    appDelegate;
    server;
    constructor(delegate) {
        this.appDelegate = delegate;
        this.server = delegate.server;
    }
    
    async echo(input, context) {
        context.item.data['echo'] = input;
        console.log(context.item.data);
        return input;
    }   
    
    async createTicket(input, context) {
        let item = context.item;
        
        const ticketContent = input.tickets;
        console.log("Début de la tâche de service");
        
        const initSessionUrl = process.env.ITSM_HOST + process.env.ITSM_URI + "/apirest.php/initSession";
        const ticketApiUrl = process.env.ITSM_HOST + process.env.ITSM_URI + "/apirest.php/Ticket/";
        const appToken = process.env.ITSM_APP_TOKEN;
        
        try {
            const sessionResponse = await axios.get(initSessionUrl, {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "user_token " + process.env.ITSM_USER_TOKEN,
                    "App-Token": appToken,
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache"
                },
            });
            
            if (sessionResponse.status === 200 && sessionResponse.data && sessionResponse.data.session_token) {
                const sessionToken = sessionResponse.data.session_token;
                
                const headers = {
                    "Content-Type": "application/json",
                    "Session-Token": sessionToken,
                    "App-Token": appToken,
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache"
                };
                
                // Changement vers profil superadmin
                const getActiveProfileUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/getActiveProfile/`;
                const profileResponse = await axios.get(getActiveProfileUrl, { headers });
                
                if (profileResponse.data.id !== 4) {
                    const changeProfileUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/changeActiveProfile/`;
                    await axios.post(changeProfileUrl, { profiles_id: 4 }, { headers });
                }
                
                // Création du payload pour le ticket
                const payload = {
                    input: {
                        name: ticketContent.title,
                        content: ticketContent.description,
                        users_id_assign: ticketContent.users_id_assign || null,
                        _users_id_assign: ticketContent.users_id_assign || null,
                        _groups_id_assign: ticketContent.groups_id_assign || null, 
                        groups_id_assign: ticketContent.groups_id_assign || null,
                        _users_id_requester: ticketContent.users_id_requester || null,
                        users_id_requester: ticketContent.users_id_requester || null,
                        type: ticketContent.type || 1,
                        status: 1,
                        entities_id: 0,
                        itilcategories_id: ticketContent.itilcategories_id || null,
                    },
                };
                
                const ticketResponse = await axios.post(ticketApiUrl, payload, { headers });
                
                if (ticketResponse.status === 201) {
                    const createdTicketId = ticketResponse.data.id;
                    console.log("ID du ticket créé:", createdTicketId);
                    
                    context.item.data.ticketId = createdTicketId;
                    
                    // Gestion de l'assignation si nécessaire
                    if (ticketContent.users_id_assign && ticketResponse.data.users_id_assign != ticketContent.users_id_assign) {
                        const assignUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/Ticket/${createdTicketId}/Ticket_User`;
                        const assignPayload = {
                            input: {
                                tickets_id: createdTicketId,
                                users_id: ticketContent.users_id_assign,
                                type: 2
                            }
                        };
                        
                        try {
                            await axios.post(assignUrl, assignPayload, { headers });
                        } catch (assignError) {
                            try {
                                const updateUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/Ticket/${createdTicketId}`;
                                const updatePayload = {
                                    input: {
                                        users_id_assign: ticketContent.users_id_assign
                                    }
                                };
                                
                                await axios.put(updateUrl, updatePayload, { headers });
                            } catch (updateError) {
                                console.error("Erreur lors de la mise à jour de l'assignation");
                            }
                        }
                    }
                    
                    // Ajout de la validation si nécessaire
                    if (context.item.data.ticketValidation) {
                        const validationUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/TicketValidation/`;
                        const validationPayload = {
                            input: {
                                tickets_id: createdTicketId,
                                users_id_validate: context.item.data.ticketValidation.input.users_id_validate,
                                groups_id_validate: context.item.data.ticketValidation.input.groups_id_validate,
                                comment_submission: context.item.data.ticketValidation.input.comment_submission,
                                validation_status: 2
                            }
                        };
                        
                        try {
                            await axios.post(validationUrl, validationPayload, { headers });
                        } catch (validationError) {
                            try {
                                const updateUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/Ticket/${createdTicketId}`;
                                const updatePayload = {
                                    input: {
                                        global_validation: 2,
                                        users_id_validate: context.item.data.ticketValidation.input.users_id_validate
                                    }
                                };
                                
                                await axios.put(updateUrl, updatePayload, { headers });
                            } catch (updateError) {
                                console.error("Erreur lors de la mise à jour du ticket");
                            }
                        }
                    }
                    
                    console.log("Tâche de service terminée avec succès");
                    
                    return {
                        ticketId: createdTicketId
                    };
                } else {
                    return {
                        error: "Échec de création de ticket"
                    };
                }
            } else {
                return {
                    error: "Échec de récupération du token de session"
                };
            }
        } catch (error) {
            console.error("Erreur lors de la communication avec l'API:", error.message);
            return {
                error: "Erreur de communication avec l'API: " + error.message
            };
        } finally {
            console.log("Fin de la tâche de service");
        }
    }
    
    async pollTicketValidation(input, context) {
        const ticketId = context.item.data.ticketId;
        
        if (!ticketId) {
            context.item.data.ticketValidated = false;
            return { error: "ID de ticket manquant", validated: false };
        }
    
        const ticketApiUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/Ticket/${ticketId}?expand_dropdowns=true`;
        const ticketValidationsUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/Ticket/${ticketId}/TicketValidation`;
        const appToken = process.env.ITSM_APP_TOKEN;
    
        try {
            const sessionResponse = await axios.get(`${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/initSession`, {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "user_token " + process.env.ITSM_USER_TOKEN,
                    "App-Token": appToken,
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache"
                },
            });
    
            if (sessionResponse.status !== 200 || !sessionResponse.data.session_token) {
                context.item.data.ticketValidated = false;
                return { error: "Échec de récupération du token de session", validated: false };
            }
    
            const sessionToken = sessionResponse.data.session_token;
            const headers = {
                "Content-Type": "application/json",
                "Session-Token": sessionToken,
                "App-Token": appToken,
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache"
            };
    
            try {
                const changeProfileUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/changeActiveProfile/`;
                await axios.post(changeProfileUrl, { profiles_id: 4 }, { headers });
            } catch (profileError) {
                console.error("Erreur lors du changement de profil");
            }
    
            let attempts = 0;
            const interval = 5000;
            const maxAttempts = 10000;
    
            // Suivre les validations déjà vues
            if (!context.item.data.seenValidations) {
                context.item.data.seenValidations = [];
            }
    
            while (attempts < maxAttempts) {
                try {
                    const ticketResponse = await axios.get(ticketApiUrl, { headers });
                    const validationsResponse = await axios.get(ticketValidationsUrl, { headers });
                    
                    if (ticketResponse.status === 200 && ticketResponse.data) {
                        const ticket = ticketResponse.data;
                        
                        if (ticket.id && ticket.id == ticketId) {
                            // Vérifier si le ticket est clos
                            if (ticket.status === 6) {
                                context.item.data.ticket_closed = true;
                                return { validated: true, ticket_closed: true };
                            }
                            
                            const globalValidationStatus = ticket.global_validation;
                            console.log(`Ticket ${ticketId}, Validation globale = ${globalValidationStatus}`);
                            
                            // Vérifier les validations individuelles refusées
                            let hasNewRejection = false;
                            let rejectionUserName = "";
                            
                            if (validationsResponse.status === 200 && Array.isArray(validationsResponse.data)) {
                                for (const validation of validationsResponse.data) {
                                    const alreadySeen = context.item.data.seenValidations.includes(validation.id);
                                    
                                    if (validation.status === 4 && !alreadySeen) { // 4 = Refusé
                                        hasNewRejection = true;
                                        rejectionUserName = validation.users_id_validate;
                                        context.item.data.seenValidations.push(validation.id);
                                        context.item.data.rejectedBy = validation.users_id_validate;
                                        break;
                                    }
                                }
                            }
                            
                            if (hasNewRejection) {
                                context.item.data.ticketValidated = false;
                                context.item.data.ticket_closed = false;
                                return { validated: false, ticket_closed: false, rejectedBy: rejectionUserName };
                            } else if (globalValidationStatus === 3) {
                                context.item.data.ticketValidated = true;
                                context.item.data.ticket_closed = false;
                                return { validated: true, ticket_closed: false };
                            } else if (globalValidationStatus === 4) {
                                context.item.data.ticketValidated = false;
                                context.item.data.ticket_closed = false;
                                return { validated: false, ticket_closed: false };
                            }
                        }
                    }
                } catch (responseError) {
                    console.error("Erreur lors de la requête");
                }
    
                attempts++;
                if (attempts < maxAttempts) await new Promise(resolve => setTimeout(resolve, interval));
            }
    
            context.item.data.ticketValidated = false;
            context.item.data.ticket_closed = false;
            return { validated: false, ticket_closed: false, timeout: true };
        } catch (error) {
            console.error("Erreur lors du polling");
            context.item.data.ticketValidated = false;
            context.item.data.ticket_closed = false;
            return { error: "Erreur lors du polling", validated: false, ticket_closed: false };
        }
    }
    
    async addTicketFollowup(input, context) {
        let item = context.item;
        const ticketId = context.item.data.ticketId;
        
        if (!ticketId) {
            return { error: "ID de ticket manquant" };
        }
        
        console.log("Début de la tâche d'ajout de suivi");
        
        const initSessionUrl = process.env.ITSM_HOST + process.env.ITSM_URI + "/apirest.php/initSession";
        const followupUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/ITILFollowup/`;
        const appToken = process.env.ITSM_APP_TOKEN;
        
        let followupContent = "Ticket clos, fin du processus";
        
        // Définir le contenu du followup
        if (input.followupData && input.followupData.content) {
            followupContent = input.followupData.content;
        } else if (context.item.data.followup && context.item.data.followup.content) {
            followupContent = context.item.data.followup.content;
        }
        
        try {
            const sessionResponse = await axios.get(initSessionUrl, {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "user_token " + process.env.ITSM_USER_TOKEN,
                    "App-Token": appToken,
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache"
                },
            });
            
            if (sessionResponse.status === 200 && sessionResponse.data && sessionResponse.data.session_token) {
                const sessionToken = sessionResponse.data.session_token;
                
                const headers = {
                    "Content-Type": "application/json",
                    "Session-Token": sessionToken,
                    "App-Token": appToken,
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache"
                };
                
                // Passer en profil superadmin
                const getActiveProfileUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/getActiveProfile/`;
                const profileResponse = await axios.get(getActiveProfileUrl, { headers });
                
                if (profileResponse.data.id !== 4) {
                    const changeProfileUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/changeActiveProfile/`;
                    await axios.post(changeProfileUrl, { profiles_id: 4 }, { headers });
                }
                
                // Création du followup
                const followupPayload = {
                    input: {
                        itemtype: "Ticket",
                        items_id: ticketId,
                        content: followupContent,
                        is_private: 0,
                        requesttypes_id: 1
                    }
                };
                
                const followupResponse = await axios.post(followupUrl, followupPayload, { headers });
                
                if (followupResponse.status === 201) {
                    console.log("Suivi ajouté avec succès, ID:", followupResponse.data.id);
                    return { success: true, followupId: followupResponse.data.id };
                } else {
                    return { error: "Échec d'ajout de suivi", details: followupResponse.data };
                }
            } else {
                return { error: "Échec de récupération du token de session" };
            }
        } catch (error) {
            console.error("Erreur lors de la communication avec l'API:", error.message);
            return { error: "Erreur de communication avec l'API: " + error.message };
        } finally {
            console.log("Fin de la tâche d'ajout de suivi");
        }
    }
    
    async addTask(input, context) {
        let item = context.item;
        const ticketId = context.item.data.ticketId;
        
        if (!ticketId) {
            return { error: "ID de ticket manquant" };
        }
        
        console.log("Début de la tâche d'ajout de tâche");
        
        const initSessionUrl = process.env.ITSM_HOST + process.env.ITSM_URI + "/apirest.php/initSession";
        const taskUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/TicketTask/`;
        const appToken = process.env.ITSM_APP_TOKEN;
        
        let taskContent = input.taskData && input.taskData.content ? 
            input.taskData.content : "Tâche ajoutée automatiquement par le workflow";
        
        try {
            const sessionResponse = await axios.get(initSessionUrl, {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "user_token " + process.env.ITSM_USER_TOKEN,
                    "App-Token": appToken,
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache"
                },
            });
            
            if (sessionResponse.status === 200 && sessionResponse.data && sessionResponse.data.session_token) {
                const sessionToken = sessionResponse.data.session_token;
                
                const headers = {
                    "Content-Type": "application/json",
                    "Session-Token": sessionToken,
                    "App-Token": appToken,
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache"
                };
                
                // Passer en profil superadmin
                const getActiveProfileUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/getActiveProfile/`;
                const profileResponse = await axios.get(getActiveProfileUrl, { headers });
                
                if (profileResponse.data.id !== 4) {
                    const changeProfileUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/changeActiveProfile/`;
                    await axios.post(changeProfileUrl, { profiles_id: 4 }, { headers });
                }
                
                // Création de la tâche
                const taskPayload = {
                    input: {
                        tickets_id: ticketId,
                        content: taskContent,
                        is_private: input.taskData && input.taskData.is_private !== undefined ? 
                            input.taskData.is_private ? 1 : 0 : 0,
                        users_id_tech: input.taskData && input.taskData.users_id_tech ?
                            input.taskData.users_id_tech : 2,
                        state: 1
                    }
                };
                
                const taskResponse = await axios.post(taskUrl, taskPayload, { headers });
                
                if (taskResponse.status === 201) {
                    console.log("Tâche ajoutée avec succès, ID:", taskResponse.data.id);
                    return { success: true, taskId: taskResponse.data.id };
                } else {
                    return { error: "Échec d'ajout de tâche", details: taskResponse.data };
                }
            } else {
                return { error: "Échec de récupération du token de session" };
            }
        } catch (error) {
            console.error("Erreur lors de la communication avec l'API:", error.message);
            return { error: "Erreur de communication avec l'API: " + error.message };
        } finally {
            console.log("Fin de la tâche d'ajout de tâche");
        }
    }
    
    async updateTicket(input, context) {
        try {
            const ticketId = input.ticketUpdate.id;
            const appToken = process.env.ITSM_APP_TOKEN;
            
            // Obtenir un jeton de session
            const sessionResponse = await axios.get(`${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/initSession`, {
                headers: {
                    "Content-Type": "application/json", 
                    "Authorization": "user_token " + process.env.ITSM_USER_TOKEN,
                    "App-Token": appToken,
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache"
                },
            });
            
            if (sessionResponse.status !== 200 || !sessionResponse.data.session_token) {
                return { error: "Échec de récupération du token de session" };
            }
            
            const sessionToken = sessionResponse.data.session_token;
            const headers = {
                "Content-Type": "application/json",
                "Session-Token": sessionToken,
                "App-Token": appToken,
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache"
            };
    
            // Passer en profil superadmin
            try {
                const changeProfileUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/changeActiveProfile/`;
                await axios.post(changeProfileUrl, { profiles_id: 4 }, { headers });
            } catch (profileError) {
                console.error("Erreur lors du changement de profil");
            }
            
            // Récupérer les assignations existantes
            const ticketUsersUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/Ticket/${ticketId}/Ticket_User`;
            const existingAssignments = await axios.get(ticketUsersUrl, { headers });

            // Récupérer les assignations de groupes existantes
            const ticketGroupsUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/Ticket/${ticketId}/Group_Ticket`;
            const existingGroupAssignments = await axios.get(ticketGroupsUrl, { headers });

            // Stocker l'ID de l'utilisateur ou groupe actuel
            const currentUserId = input.ticketUpdate.users_id_assign;
            const currentGroupId = input.ticketUpdate.groups_id_assign;

            // Traiter les assignations utilisateur existantes
            if (existingAssignments.data && Array.isArray(existingAssignments.data)) {
                const assignmentsToRemove = existingAssignments.data.filter(assignment =>
                    assignment.type === 2 && assignment.users_id != currentUserId
                );
                
                for (const assignment of assignmentsToRemove) {
                    // Supprimer l'assignation
                    try {
                        const deleteUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/Ticket_User/`;
                        const deletePayload = {
                            input: { id: assignment.id },
                            force_purge: true
                        };
                        
                        await axios.delete(deleteUrl, { headers, data: deletePayload });
                    } catch (deleteError) {
                        console.error("Erreur lors de la suppression d'assignation");
                    }
                    
                    // Ajouter comme observateur
                    try {
                        const observerPayload = {
                            input: {
                                tickets_id: ticketId,
                                users_id: assignment.users_id,
                                type: 3 // Observateur
                            }
                        };
                        
                        const observerUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/Ticket_User/`;
                        await axios.post(observerUrl, observerPayload, { headers });
                    } catch (observerError) {
                        console.error("Erreur lors de l'ajout d'observateur");
                    }
                }
            }
            if (existingGroupAssignments.data && Array.isArray(existingGroupAssignments.data)) {
    const groupAssignmentsToRemove = existingGroupAssignments.data.filter(assignment =>
        assignment.type === 2 && assignment.groups_id != currentGroupId
    );

    for (const assignment of groupAssignmentsToRemove) {
        try {
            const deleteUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/Group_Ticket/`;
            const deletePayload = {
                input: { id: assignment.id },
                force_purge: true
            };

            await axios.delete(deleteUrl, { headers, data: deletePayload });
        } catch (deleteError) {
            console.error("Erreur lors de la suppression d'assignation groupe");
        }
    }
}

            // Assigner le nouvel utilisateur si nécessaire
            if (currentUserId) {
                const isAlreadyAssigned = existingAssignments.data && Array.isArray(existingAssignments.data) ?
                    existingAssignments.data.some(a => a.users_id == currentUserId && a.type === 2) : false;
                
                if (!isAlreadyAssigned) {
                    try {
                        const assignPayload = {
                            input: {
                                tickets_id: ticketId,
                                users_id: currentUserId,
                                type: 2 // Assigné
                            }
                        };
                        
                        const assignUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/Ticket_User/`;
                        await axios.post(assignUrl, assignPayload, { headers });
                    } catch (assignError) {
                        console.error("Erreur lors de l'assignation");
                    }
                }
            }
            
            // Ajouter l'observateur si spécifié
            if (input.ticketUpdate.users_id_observer) {
                const existingObservers = existingAssignments.data && Array.isArray(existingAssignments.data) ? 
                    existingAssignments.data.filter(a => a.users_id == input.ticketUpdate.users_id_observer && a.type === 3) : [];
                
                if (existingObservers.length === 0) {
                    try {
                        const observerPayload = {
                            input: {
                                tickets_id: ticketId,
                                users_id: input.ticketUpdate.users_id_observer,
                                type: 3 // Observateur
                            }
                        };
                        
                        const observerUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/Ticket_User/`;
                        await axios.post(observerUrl, observerPayload, { headers });
                    } catch (observerError) {
                        console.error("Erreur lors de l'ajout d'observateur");
                    }
                }
            }
            
            // Ajouter une validation si nécessaire
            if (input.ticketValidation) {
                try {
                    const validationUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/TicketValidation/`;
                    const validationPayload = {
                        ...input.ticketValidation,
                        input: {
                            ...input.ticketValidation.input,
                            tickets_id: ticketId
                        }
                    };
                    
                    await axios.post(validationUrl, validationPayload, { headers });
                } catch (validationError) {
                    console.error("Erreur lors de l'ajout de validation");
                }
            }
            
            console.log("Fin de la tâche de mise à jour du ticket");
            
            // Stockage de l'ID du ticket pour les tâches suivantes
            if (context && context.item && context.item.data) {
                context.item.data.ticketId = ticketId;
            }
            
            return { ticketId };
        } catch (error) {
            console.error("Erreur lors de la mise à jour du ticket");
            return { error: "Échec de la mise à jour du ticket" };
        }
    }
    
    async killSession(input, context) {
        console.log("Début de la fonction killSession");
        
        const initSessionUrl = process.env.ITSM_HOST + process.env.ITSM_URI + "/apirest.php/initSession";
        const appToken = process.env.ITSM_APP_TOKEN;
        
        try {
            // Créer une nouvelle session
            const sessionResponse = await axios.get(initSessionUrl, {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "user_token " + process.env.ITSM_USER_TOKEN,
                    "App-Token": appToken,
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache"
                },
            });
            
            if (sessionResponse.status === 200 && sessionResponse.data && sessionResponse.data.session_token) {
                const sessionToken = sessionResponse.data.session_token;
                
                const headers = {
                    "Content-Type": "application/json",
                    "Session-Token": sessionToken,
                    "App-Token": appToken,
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache"
                };
                
                // Réinitialiser le profil
                try {
                    const getActiveProfileUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/getActiveProfile/`;
                    const profileResponse = await axios.get(getActiveProfileUrl, { headers });
                    
                    if (profileResponse.data.id !== 1) {
                        const resetProfileUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/changeActiveProfile/`;
                        await axios.post(resetProfileUrl, { profiles_id: 1 }, { headers });
                    }
                } catch (profileError) {
                    console.error("Erreur lors du changement de profil");
                }
                
                // Tuer la session avec la méthode qui fonctionne
                try {
                    const killSessionUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/killSession/`;
                    await axios.get(killSessionUrl, { headers });
                    console.log("Session terminée avec succès");
                    return { success: true };
                } catch (killError) {
                    console.error("Erreur lors de la terminaison de session:", killError.message);
                    return { success: false, error: "Échec de terminaison de session" };
                }
            } else {
                return { success: false, error: "Échec de récupération du token de session" };
            }
        } catch (error) {
            console.error("Erreur lors de l'exécution de killSession:", error.message);
            return { success: false, error: error.message };
        } finally {
            console.log("Fin de la fonction killSession");
        }
    }
    
    async closeTicket(input, context) {
        const ticketId = input.ticketId || context.item.data.ticketId;

        if (!ticketId) {
            return { error: "ID de ticket manquant" };
        }

        console.log("Début de la tâche de fermeture de ticket");

        const initSessionUrl = process.env.ITSM_HOST + process.env.ITSM_URI + "/apirest.php/initSession";
        const updateTicketUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/Ticket/${ticketId}`;
        const appToken = process.env.ITSM_APP_TOKEN;

        try {
            const sessionResponse = await axios.get(initSessionUrl, {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "user_token " + process.env.ITSM_USER_TOKEN,
                    "App-Token": appToken,
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache"
                },
            });

            if (sessionResponse.status === 200 && sessionResponse.data && sessionResponse.data.session_token) {
                const sessionToken = sessionResponse.data.session_token;

                const headers = {
                    "Content-Type": "application/json",
                    "Session-Token": sessionToken,
                    "App-Token": appToken,
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache"
                };

                // Passer en profil superadmin
                const getActiveProfileUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/getActiveProfile/`;
                const profileResponse = await axios.get(getActiveProfileUrl, { headers });

                if (profileResponse.data.id !== 4) {
                    const changeProfileUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/changeActiveProfile/`;
                    await axios.post(changeProfileUrl, { profiles_id: 4 }, { headers });
                }

                // Clôture du ticket
                const closedPayload = {
                    input: {
                        status: 6
                    }
                };

                const ticketResponse = await axios.put(updateTicketUrl, closedPayload, { headers });

                if (ticketResponse.status === 200) {
                    console.log("Ticket clos avec succès, ID:", ticketId);
                    context.item.data.ticket_closed = true;

                    return {
                        success: true,
                        ticketId: ticketId,
                        ticket_closed: true
                    };
                } else {
                    return {
                        error: "Échec de la fermeture du ticket"
                    };
                }
            } else {
                return {
                    error: "Échec de récupération du token de session"
                };
            }
        } catch (error) {
            console.error("Erreur lors de la fermeture du ticket:", error.message);
            return {
                error: "Erreur de communication avec l'API: " + error.message
            };
        } finally {
            console.log("Fin de la tâche de fermeture de ticket");
        }
    }

    async raiseBPMNError(input, context) {
        return { bpmnError: ' Something went wrong' };
    }
}
export { AppServices }