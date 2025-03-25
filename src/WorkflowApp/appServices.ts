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
    
        type Ticket = {
            id: number,
            title: string,
            description: string,
            requester: {
                users_id_recipient: number[]
                groups: number[]
            },
            watchers: {
                users_id_recipient: number[]
                groups: number[]
            },
            assignee: {
                users_id_recipient: number[]
                groups: number[]
                suppliers: number[]
            }
        };
    
        const ticketContent: Ticket = input.tickets;
    
        console.log("Début de la tâche de service");
        console.log("ID de l'élément BPMN :", item.elementId);
    
        const initSessionUrl = process.env.ITSM_HOST + process.env.ITSM_URI + "/apirest.php/initSession";
        const ticketApiUrl = process.env.ITSM_HOST + process.env.ITSM_URI + "/apirest.php/Ticket/";
        const appToken = process.env.ITSM_APP_TOKEN;
    
        const payload = {
            input: {
                name: ticketContent.title,
                content: ticketContent.description,
            },
        };
    
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
    
                const headers = {
                    "Content-Type": "application/json",
                    "Session-Token": sessionToken,
                    "App-Token": appToken,
                };
    
                const ticketResponse = await axios.post(ticketApiUrl, payload, { headers });
    
                if (ticketResponse.status === 201) {
                    const createdTicketId = ticketResponse.data.id;
                    console.log("ID du ticket créé :", createdTicketId);
                    
                    context.item.data.ticketId = createdTicketId;
                    
                    return {
                        ticketId: createdTicketId
                    };
                } else {
                    console.log("Problème lors de la création :", ticketResponse.status, ticketResponse.data);
                    return {
                        error: "Échec de création de ticket"
                    };
                }
            } else {
                console.error("Impossible de récupérer le session token :", sessionResponse.data);
                return {
                    error: "Échec de récupération du token de session"
                };
            }
        } catch (error) {
            console.error("Erreur lors de la communication avec l'API :", error.message);
            return {
                error: "Erreur de communication avec l'API"
            };
        } finally {
            console.log("Fin de la tâche de service");
        }
    }
    
    async pollTicketValidation(input, context) {
        const ticketId = context.item.data.ticketId;
        
        if (!ticketId) {
            console.error("Aucun ID de ticket trouvé dans le contexte");
            return { error: "ID de ticket manquant" };
        }
    
        const ticketApiUrl = `${process.env.ITSM_HOST}${process.env.ITSM_URI}/apirest.php/Ticket/${ticketId}?expand_dropdowns=true`;
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
                return { error: "Échec de récupération du token de session" };
            }
    
            const sessionToken = sessionResponse.data.session_token;
            const headers = {
                "Content-Type": "application/json",
                "Session-Token": sessionToken,
                "App-Token": appToken,
            };
    
            let attempts = 0;
            const interval = 5000;
            const maxAttempts = 7200;
    
            while (attempts < maxAttempts) {
                try {
                    const ticketResponse = await axios.get(ticketApiUrl, { headers });
    
                    if (ticketResponse.status === 200 && ticketResponse.data) {
                        const ticket = ticketResponse.data;
                        
                        if (ticket.id && ticket.id == ticketId) {
                            const validationStatus = ticket.global_validation;
                            console.log(`Tentative ${attempts + 1}: Ticket ${ticketId}, Validation = ${validationStatus}`);
    
                            if (validationStatus === 3) {
                                console.log("Ticket validé !");
                                context.item.data.ticketValidated = true;
                                return { validated: true };
                            } else if (validationStatus === 4) {
                                console.log("Ticket refusé !");
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
            return { validated: false };
        } catch (error) {
            console.error("Erreur lors du polling :", error.message);
            context.item.data.ticketValidated = false;
            return { error: "Erreur lors du polling" };
        }
    }

    async addFollowUp(input, context) {
        return { followUp: ' Something went wrong' };
    }

    async raiseBPMNError(input, context) {
        return { bpmnError: ' Something went wrong' };
    }
}
export { AppServices }
