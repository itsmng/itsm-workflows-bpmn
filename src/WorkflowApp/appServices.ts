import * as readline from 'readline';
import { log } from '../test/helpers/BPMNTester';
import axios from 'axios';

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
        console.log("ID de l'élément BPMN :", item.elementId);
        console.log("Contenu du ticket :", JSON.stringify(ticketContent));
        
        const initSessionUrl = process.env.ITSM_HOST + process.env.ITSM_URI + "/apirest.php/initSession";
        const ticketApiUrl = process.env.ITSM_HOST + process.env.ITSM_URI + "/apirest.php/Ticket/";
        const appToken = process.env.ITSM_APP_TOKEN;
        
        try {
            const sessionResponse = await axios.get(initSessionUrl, {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "user_token " + process.env.ITSM_USER_TOKEN,
                    "App-Token": appToken,
                },
            });
            
            if (sessionResponse.status === 200 && sessionResponse.data && sessionResponse.data.session_token) {
                const sessionToken = sessionResponse.data.session_token;
                console.log("Session token obtenu:", sessionToken.substring(0, 10) + "...");
                
                const headers = {
                    "Content-Type": "application/json",
                    "Session-Token": sessionToken,
                    "App-Token": appToken,
                };
                
                console.log("Vérification du profil actif...");
                const getActiveProfileUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/getActiveProfile/`;
                const profileResponse = await axios.get(getActiveProfileUrl, { headers });
                console.log("Profil actif:", JSON.stringify(profileResponse.data));
                
                if (profileResponse.data.id !== 4) {
                    console.log("Changement vers le profil superadmin...");
                    const changeProfileUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/changeActiveProfile/`;
                    const changeResponse = await axios.post(changeProfileUrl, {
                        profiles_id: 4 
                    }, { headers });
                    console.log("Changement de profil réussi:", JSON.stringify(changeResponse.data));
                } else {
                    console.log("Déjà sur le profil superadmin, aucun changement nécessaire");
                }
                
                const payload = {
                    input: {
                        name: ticketContent.title,
                        content: ticketContent.description,
                        users_id_assign: ticketContent.users_id_assign || null,
                        _users_id_assign: ticketContent.users_id_assign || null,
                        _users_id_requester: ticketContent.users_id_requester || null,
                        users_id_requester: ticketContent.users_id_requester || null,
                        status: 1,
                        entities_id: 0
                    },
                };
                
                console.log("Création du ticket en cours...");
                const ticketResponse = await axios.post(ticketApiUrl, payload, { headers });
                
                if (ticketResponse.status === 201) {
                    const createdTicketId = ticketResponse.data.id;
                    console.log("ID du ticket créé:", createdTicketId);
                    
                    context.item.data.ticketId = createdTicketId;
                    
                    if (ticketContent.users_id_assign && ticketResponse.data.users_id_assign != ticketContent.users_id_assign) {
                        console.log("Tentative d'assignation via l'endpoint spécifique...");
                        const assignUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/Ticket/${createdTicketId}/Ticket_User`;
                        const assignPayload = {
                            input: {
                                tickets_id: createdTicketId,
                                users_id: ticketContent.users_id_assign,
                                type: 2
                            }
                        };
                        
                        try {
                            const assignResponse = await axios.post(assignUrl, assignPayload, { headers });
                            console.log("Assignation réussie via l'endpoint spécifique:", assignResponse.status);
                        } catch (assignError) {
                            console.error("Erreur lors de l'assignation via l'endpoint spécifique:", assignError.message);
                            
                            try {
                                console.log("Tentative alternative avec l'API standard...");
                                const updateUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/Ticket/${createdTicketId}`;
                                const updatePayload = {
                                    input: {
                                        users_id_assign: ticketContent.users_id_assign
                                    }
                                };
                                
                                const updateResponse = await axios.put(updateUrl, updatePayload, { headers });
                                console.log("Mise à jour de l'assignation réussie:", updateResponse.status);
                            } catch (updateError) {
                                console.error("Erreur lors de la mise à jour de l'assignation:", updateError.message);
                            }
                        }
                    }
                    
                    if (context.item.data.ticketValidation) {
                        console.log("Ajout de la demande de validation...");
                        const validationUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/TicketValidation/`;
                        const validationPayload = {
                            input: {
                                tickets_id: createdTicketId,
                                users_id_validate: context.item.data.ticketValidation.input.users_id_validate,
                                comment_submission: context.item.data.ticketValidation.input.comment_submission,
                                validation_status: 2
                            }
                        };
                        
                        try {
                            const validationResponse = await axios.post(validationUrl, validationPayload, { headers });
                            console.log("Validation ajoutée avec succès:", validationResponse.status);
                        } catch (validationError) {
                            console.error("Erreur lors de l'ajout de la validation:", validationError.message);
                            if (validationError.response) {
                                console.error("Détails de l'erreur:", validationError.response.data);
                            }
                        
                            try {
                                console.log("Tentative alternative: mise à jour directe du ticket...");
                                const updateUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/Ticket/${createdTicketId}`;
                                const updatePayload = {
                                    input: {
                                        global_validation: 2,
                                        users_id_validate: context.item.data.ticketValidation.input.users_id_validate
                                    }
                                };
                                
                                const updateResponse = await axios.put(updateUrl, updatePayload, { headers });
                                console.log("Mise à jour du ticket réussie:", updateResponse.status);
                            } catch (updateError) {
                                console.error("Erreur lors de la mise à jour du ticket:", updateError.message);
                            }
                        }
                    }
                    
                    console.log("Tâche de service terminée avec succès");
                    return {
                        ticketId: createdTicketId
                    };
                } else {
                    console.log("Problème lors de la création:", ticketResponse.status, ticketResponse.data);
                    return {
                        error: "Échec de création de ticket"
                    };
                }
            } else {
                console.error("Impossible de récupérer le session token:", sessionResponse.data);
                return {
                    error: "Échec de récupération du token de session"
                };
            }
        } catch (error) {
            console.error("Erreur lors de la communication avec l'API:", error.message);
            if (error.response) {
                console.error("Détails de l'erreur:", error.response.status, error.response.data);
            }
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
            console.error("Aucun ID de ticket trouvé dans le contexte");
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
                },
            });
    
            if (sessionResponse.status !== 200 || !sessionResponse.data.session_token) {
                console.error("Impossible de récupérer le session token :", sessionResponse.data);
                context.item.data.ticketValidated = false;
                return { error: "Échec de récupération du token de session", validated: false };
            }
    
            const sessionToken = sessionResponse.data.session_token;
            const headers = {
                "Content-Type": "application/json",
                "Session-Token": sessionToken,
                "App-Token": appToken,
            };
    
            // Activer le profil superadmin
            try {
                console.log("Changement vers le profil superadmin...");
                const changeProfileUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/changeActiveProfile/`;
                await axios.post(changeProfileUrl, { profiles_id: 4 }, { headers });
                console.log("Changement de profil réussi");
            } catch (profileError) {
                console.error("Erreur lors du changement de profil:", profileError.message);
            }
    
            let attempts = 0;
            const interval = 5000;
            const maxAttempts = 30; // Réduire le nombre de tentatives pour éviter les longues boucles
    
            // Suivre les validations déjà vues pour ne pas traiter 2 fois le même refus
            if (!context.item.data.seenValidations) {
                context.item.data.seenValidations = [];
            }
    
            while (attempts < maxAttempts) {
                try {
                    // Obtenir le ticket complet
                    const ticketResponse = await axios.get(ticketApiUrl, { headers });
                    
                    // Obtenir les validations individuelles
                    const validationsResponse = await axios.get(ticketValidationsUrl, { headers });
                    
                    if (ticketResponse.status === 200 && ticketResponse.data) {
                        const ticket = ticketResponse.data;
                        
                        if (ticket.id && ticket.id == ticketId) {
                            const globalValidationStatus = ticket.global_validation;
                            console.log(`Tentative ${attempts + 1}: Ticket ${ticketId}, Validation globale = ${globalValidationStatus}`);
                            console.log(`Status de validation global: ${globalValidationStatus} (3=validé, 4=refusé, 2=en attente)`);
                            
                            // Vérifier s'il y a des validations individuelles refusées
                            let hasNewRejection = false;
                            let rejectionUserName = "";
                            
                            if (validationsResponse.status === 200 && Array.isArray(validationsResponse.data)) {
                                console.log("Validations individuelles :", JSON.stringify(validationsResponse.data));
                                
                                for (const validation of validationsResponse.data) {
                                    // Vérifier si cette validation a déjà été traitée
                                    const alreadySeen = context.item.data.seenValidations.includes(validation.id);
                                    
                                    if (validation.status === 4 && !alreadySeen) { // 4 = Refusé
                                        console.log(`Détection d'une validation individuelle refusée par l'utilisateur ${validation.users_id_validate}`);
                                        hasNewRejection = true;
                                        rejectionUserName = validation.users_id_validate;
                                        
                                        // Marquer cette validation comme traitée
                                        context.item.data.seenValidations.push(validation.id);
                                        
                                        // Stocke l'information sur le refus
                                        context.item.data.rejectedBy = validation.users_id_validate;
                                        break;
                                    }
                                }
                            }
                            
                            if (hasNewRejection) {
                                console.log("Ticket refusé par au moins un validateur !");
                                context.item.data.ticketValidated = false;
                                
                                // Incrémenter le compteur de refus
                                if (!context.item.data.rejectionCount) {
                                    context.item.data.rejectionCount = 1;
                                } else {
                                    context.item.data.rejectionCount++;
                                }
                                
                                // Vérifier si on a atteint le maximum de rejets autorisés
                                const maxRejections = 3;
                                if (context.item.data.rejectionCount >= maxRejections) {
                                    console.log(`Maximum de rejets (${maxRejections}) atteint. Forcer la sortie du workflow.`);
                                    context.item.data.forceExit = true;
                                }
                                
                                return { 
                                    validated: false, 
                                    rejectedBy: rejectionUserName,
                                    rejectionCount: context.item.data.rejectionCount,
                                    forceExit: context.item.data.forceExit
                                };
                            } else if (globalValidationStatus === 3) {
                                console.log("Ticket validé globalement !");
                                context.item.data.ticketValidated = true;
                                return { validated: true };
                            } else if (globalValidationStatus === 4) {
                                console.log("Ticket refusé globalement !");
                                context.item.data.ticketValidated = false;
                                return { validated: false };
                            }
                        } else {
                            console.error("Le ticket retourné ne correspond pas à l'ID attendu.");
                        }
                    } else {
                        console.log("Erreur lors de la récupération du ticket :", ticketResponse.status);
                    }
                } catch (responseError) {
                    console.error("Erreur lors de la requête :", responseError.message);
                }
    
                attempts++;
                if (attempts < maxAttempts) await new Promise(resolve => setTimeout(resolve, interval));
            }
    
            console.log("Temps écoulé, la validation du ticket est toujours en attente.");
            context.item.data.ticketValidated = false;
            return { validated: false, timeout: true };
        } catch (error) {
            console.error("Erreur lors du polling :", error.message);
            context.item.data.ticketValidated = false;
            return { error: "Erreur lors du polling", validated: false };
        }
    }

    async addTicketFollowup(input, context) {
        let item = context.item;
        const ticketId = context.item.data.ticketId;
        
        if (!ticketId) {
            console.error("Aucun ID de ticket trouvé dans le contexte");
            return { error: "ID de ticket manquant" };
        }
        
        console.log("Début de la tâche d'ajout de suivi");
        console.log("ID du ticket :", ticketId);
        
        const initSessionUrl = process.env.ITSM_HOST + process.env.ITSM_URI + "/apirest.php/initSession";
        const followupUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/ITILFollowup/`;
        const appToken = process.env.ITSM_APP_TOKEN;
        
        let followupContent = "";
        if (input.followup && input.followup.content) {
            followupContent = input.followup.content;
        } else {
            followupContent = "Suivi ajouté automatiquement par le workflow";
        }
        
        try {
            const sessionResponse = await axios.get(initSessionUrl, {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "user_token " + process.env.ITSM_USER_TOKEN,
                    "App-Token": appToken,
                },
            });
            
            if (sessionResponse.status === 200 && sessionResponse.data && sessionResponse.data.session_token) {
                const sessionToken = sessionResponse.data.session_token;
                console.log("Session token obtenu");
                
                const headers = {
                    "Content-Type": "application/json",
                    "Session-Token": sessionToken,
                    "App-Token": appToken,
                };
                
                console.log("Vérification du profil actif...");
                const getActiveProfileUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/getActiveProfile/`;
                const profileResponse = await axios.get(getActiveProfileUrl, { headers });
                console.log("Profil actif:", JSON.stringify(profileResponse.data));
                
                if (profileResponse.data.id !== 4) {
                    console.log("Changement vers le profil superadmin...");
                    const changeProfileUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/changeActiveProfile/`;
                    const changeResponse = await axios.post(changeProfileUrl, { profiles_id: 4 }, { headers });
                    console.log("Changement de profil réussi");
                }
                
                const followupPayload = {
                    input: {
                        itemtype: "Ticket",
                        items_id: ticketId,
                        content: followupContent,
                        is_private: 0,
                        requesttypes_id: 1
                    }
                };
                
                if (input.followup && input.followup.is_private !== undefined) {
                    followupPayload.input.is_private = input.followup.is_private ? 1 : 0;
                }
                
                console.log("Ajout du suivi avec payload:", JSON.stringify(followupPayload));
                const followupResponse = await axios.post(followupUrl, followupPayload, { headers });
                
                if (followupResponse.status === 201) {
                    console.log("Suivi ajouté avec succès, ID:", followupResponse.data.id);
                    return { 
                        success: true,
                        followupId: followupResponse.data.id
                    };
                } else {
                    console.error("Problème lors de l'ajout du suivi:", followupResponse.status, followupResponse.data);
                    return {
                        error: "Échec d'ajout de suivi",
                        details: followupResponse.data
                    };
                }
            } else {
                console.error("Impossible de récupérer le session token");
                return {
                    error: "Échec de récupération du token de session"
                };
            }
        } catch (error) {
            console.error("Erreur lors de la communication avec l'API:", error.message);
            if (error.response) {
                console.error("Détails de l'erreur:", error.response.status, error.response.data);
            }
            return {
                error: "Erreur de communication avec l'API: " + error.message
            };
        } finally {
            console.log("Fin de la tâche d'ajout de suivi");
        }
    }

    async addTask(input, context) {
        let item = context.item;
        const ticketId = context.item.data.ticketId;
        
        if (!ticketId) {
            console.error("Aucun ID de ticket trouvé dans le contexte");
            return { error: "ID de ticket manquant" };
        }
        
        console.log("Début de la tâche d'ajout de tâche");
        console.log("ID du ticket :", ticketId);
        
        const initSessionUrl = process.env.ITSM_HOST + process.env.ITSM_URI + "/apirest.php/initSession";
        const taskUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/TicketTask/`;
        const appToken = process.env.ITSM_APP_TOKEN;
        
        let taskContent = "";
        if (input.taskData && input.taskData.content) {
            taskContent = input.taskData.content;
        } else {
            taskContent = "Tâche ajoutée automatiquement par le workflow";
        }
        
        try {
            const sessionResponse = await axios.get(initSessionUrl, {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "user_token " + process.env.ITSM_USER_TOKEN,
                    "App-Token": appToken,
                },
            });
            
            if (sessionResponse.status === 200 && sessionResponse.data && sessionResponse.data.session_token) {
                const sessionToken = sessionResponse.data.session_token;
                console.log("Session token obtenu");
                
                const headers = {
                    "Content-Type": "application/json",
                    "Session-Token": sessionToken,
                    "App-Token": appToken,
                };
                
                console.log("Vérification du profil actif...");
                const getActiveProfileUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/getActiveProfile/`;
                const profileResponse = await axios.get(getActiveProfileUrl, { headers });
                console.log("Profil actif:", JSON.stringify(profileResponse.data));
                
                if (profileResponse.data.id !== 4) {
                    console.log("Changement vers le profil superadmin...");
                    const changeProfileUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/changeActiveProfile/`;
                    const changeResponse = await axios.post(changeProfileUrl, { profiles_id: 4 }, { headers });
                    console.log("Changement de profil réussi");
                }
                
                const taskPayload = {
                    input: {
                        tickets_id: ticketId,
                        content: taskContent,
                        is_private: 0,
                        users_id_tech: 2,
                        state: 1
                    }
                };
                
                if (input.taskData && input.taskData.is_private !== undefined) {
                    taskPayload.input.is_private = input.taskData.is_private ? 1 : 0;
                }
                
                console.log("Ajout de la tâche avec payload:", JSON.stringify(taskPayload));
                const taskResponse = await axios.post(taskUrl, taskPayload, { headers });
                
                if (taskResponse.status === 201) {
                    console.log("Tâche ajoutée avec succès, ID:", taskResponse.data.id);
                    return { 
                        success: true,
                        taskId: taskResponse.data.id
                    };
                } else {
                    console.error("Problème lors de l'ajout de la tâche:", taskResponse.status, taskResponse.data);
                    return {
                        error: "Échec d'ajout de tâche",
                        details: taskResponse.data
                    };
                }
            } else {
                console.error("Impossible de récupérer le session token");
                return {
                    error: "Échec de récupération du token de session"
                };
            }
        } catch (error) {
            console.error("Erreur lors de la communication avec l'API:", error.message);
            if (error.response) {
                console.error("Détails de l'erreur:", error.response.status, error.response.data);
            }
            return {
                error: "Erreur de communication avec l'API: " + error.message
            };
        } finally {
            console.log("Fin de la tâche d'ajout de tâche");
        }
    }

    async updateTicket(input, context) {
        try {
            const ticketId = input.ticketUpdate.id;
            const appToken = process.env.ITSM_APP_TOKEN;
            
            // Obtenir un jeton de session
            console.log("Obtention d'un jeton de session...");
            const sessionResponse = await axios.get(`${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/initSession`, {
                headers: {
                    "Content-Type": "application/json", 
                    "Authorization": "user_token " + process.env.ITSM_USER_TOKEN,
                    "App-Token": appToken,
                },
            });
            
            if (sessionResponse.status !== 200 || !sessionResponse.data.session_token) {
                console.error("Impossible de récupérer le session token :", sessionResponse.data);
                return { error: "Échec de récupération du token de session" };
            }
            
            const sessionToken = sessionResponse.data.session_token;
            const headers = {
                "Content-Type": "application/json",
                "Session-Token": sessionToken,
                "App-Token": appToken,
            };
    
            // Activer le profil superadmin
            try {
                console.log("Changement vers le profil superadmin...");
                const changeProfileUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/changeActiveProfile/`;
                await axios.post(changeProfileUrl, { profiles_id: 4 }, { headers });
                console.log("Changement de profil réussi");
            } catch (profileError) {
                console.error("Erreur lors du changement de profil:", profileError.message);
            }
            
            // Récupérer les assignations existantes pour ce ticket
            console.log("Récupération des assignations existantes...");
            const ticketUsersUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/Ticket/${ticketId}/Ticket_User`;
            const existingAssignments = await axios.get(ticketUsersUrl, { headers });
            
            // Stocker l'ID de l'utilisateur actuel
            const currentUserId = input.ticketUpdate.users_id_assign;
            
            // Parcourir les assignations existantes
            if (existingAssignments.data && Array.isArray(existingAssignments.data)) {
                console.log("Assignations existantes :", JSON.stringify(existingAssignments.data));
                
                // Filtrer pour trouver les assignations de type 2 (assigné) qui ne sont pas l'utilisateur actuel
                const assignmentsToConvert = existingAssignments.data.filter(assignment => 
                    assignment.type === 2 && assignment.users_id != currentUserId
                );
                
                // Pour chaque ancien assigné, changer son type à 3 (observateur)
                for (const assignment of assignmentsToConvert) {
                    console.log(`Traitement de l'utilisateur ${assignment.users_id} (actuellement assigné)...`);
                    
                    // Modifier directement l'assignation existante pour changer son type
                    try {
                        console.log(`Modification de l'assignation (ID: ${assignment.id}) pour l'utilisateur ${assignment.users_id}...`);
                        
                        // URL pour la mise à jour de l'assignation
                        const updateUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/Ticket_User/${assignment.id}`;
                        
                        // Payload pour la mise à jour (changer le type à 3 = observateur)
                        const updatePayload = {
                            input: {
                                id: assignment.id,
                                type: 3 // Changer en observateur
                            }
                        };
                        
                        // Effectuer la mise à jour avec PUT
                        await axios.put(updateUrl, updatePayload, { headers });
                        console.log(`Assignation modifiée avec succès pour l'utilisateur ${assignment.users_id}`);
                    } catch (updateError) {
                        console.error(`Erreur lors de la modification de l'assignation pour l'utilisateur ${assignment.users_id}:`, updateError.message);
                    }
                }
            }
            
            // Assigner le nouvel utilisateur
            if (input.ticketUpdate.users_id_assign) {
                // Vérifier si l'utilisateur est déjà assigné
                const isAlreadyAssigned = existingAssignments.data && Array.isArray(existingAssignments.data) ? 
                    existingAssignments.data.some(a => a.users_id == input.ticketUpdate.users_id_assign && a.type === 2) : false;
                
                if (!isAlreadyAssigned) {
                    console.log(`Ajout de l'utilisateur ${input.ticketUpdate.users_id_assign} comme assigné...`);
                    const assignPayload = {
                        input: {
                            tickets_id: ticketId,
                            users_id: input.ticketUpdate.users_id_assign,
                            type: 2 // Type 2 = assigné
                        }
                    };
                    
                    const assignUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/Ticket_User/`;
                    try {
                        await axios.post(assignUrl, assignPayload, { headers });
                        console.log(`Utilisateur ${input.ticketUpdate.users_id_assign} assigné avec succès`);
                    } catch (assignError) {
                        console.error(`Erreur lors de l'assignation de l'utilisateur ${input.ticketUpdate.users_id_assign}:`, assignError.message);
                    }
                } else {
                    console.log(`L'utilisateur ${input.ticketUpdate.users_id_assign} est déjà assigné`);
                }
            }
            
            // Ajouter l'observateur si nécessaire
            if (input.ticketUpdate.users_id_observer) {
                // Vérifier si l'observateur existe déjà pour éviter les doublons
                const existingObservers = existingAssignments.data && Array.isArray(existingAssignments.data) ? 
                    existingAssignments.data.filter(a => a.users_id == input.ticketUpdate.users_id_observer && a.type === 3) : [];
                
                if (existingObservers.length === 0) {
                    console.log(`Ajout de l'utilisateur ${input.ticketUpdate.users_id_observer} comme observateur...`);
                    const observerPayload = {
                        input: {
                            tickets_id: ticketId,
                            users_id: input.ticketUpdate.users_id_observer,
                            type: 3 // Type 3 = observateur
                        }
                    };
                    
                    const observerUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/Ticket_User/`;
                    try {
                        await axios.post(observerUrl, observerPayload, { headers });
                        console.log(`Utilisateur ${input.ticketUpdate.users_id_observer} ajouté comme observateur avec succès`);
                    } catch (observerError) {
                        console.error(`Erreur lors de l'ajout de l'utilisateur ${input.ticketUpdate.users_id_observer} comme observateur:`, observerError.message);
                    }
                } else {
                    console.log(`L'utilisateur ${input.ticketUpdate.users_id_observer} est déjà observateur (${existingObservers.length} fois)`);
                }
            }
            
            if (input.ticketValidation) {
                try {
                    console.log("Ajout d'une validation de ticket...");
                    const validationUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/TicketValidation/`;
                    
                    const validationPayload = {
                        ...input.ticketValidation,
                        input: {
                            ...input.ticketValidation.input,
                            tickets_id: ticketId
                        }
                    };
                    
                    await axios.post(validationUrl, validationPayload, { headers });
                    console.log(`Validation ajoutée pour l'utilisateur ${validationPayload.input.users_id_validate}`);
                } catch (validationError) {
                    console.error("Erreur lors de l'ajout de la validation:", validationError.message);
                }
            }
            
            try {
                console.log("Ajout d'un suivi pour la réassignation...");
                
                const followupUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/Ticket/${ticketId}/TicketFollowup/`;
                await axios.post(followupUrl, {
                    input: {
                        content: `Ticket traité dans le cadre du workflow de fiche de départ`,
                        is_private: 0,
                        requesttypes_id: 1
                    }
                }, { headers });
                
                console.log("Suivi ajouté avec succès");
            } catch (followupError) {
                console.error("Erreur lors de l'ajout du suivi:", followupError.message);
            }
            
            console.log("Fin de la tâche de mise à jour du ticket");
            
            if (context && context.item && context.item.data) {
                context.item.data.ticketId = ticketId;
            }
            
            return { ticketId };
        } catch (error) {
            console.error("Erreur lors de la mise à jour du ticket :", error.message);
            return { error: "Échec de la mise à jour du ticket" };
        }
    }
    async raiseBPMNError(input, context) {
        return { bpmnError: ' Something went wrong' };
    }
}
export { AppServices }
