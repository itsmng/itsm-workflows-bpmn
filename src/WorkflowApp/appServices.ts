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
        this.pollWorkflowStatus = this.pollWorkflowStatus.bind(this);
    }
    
    async echo(input, context) {
        console.log('service echo - input', input);
        context.item.data['echo'] = input;
        return input;
    }
    
    async createTicket(input, context) {
        let item = context.item;
    
        type Ticket = {
            id: number,
            title: string,
            description: string,
            requester: {
                users: number[]
                groups: number[]
            },
            watchers: {
                users: number[]
                groups: number[]
            },
            assignee: {
                users: number[]
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
                    console.log("Asset créé avec succès :", ticketResponse.data);
                } else {
                    console.log("Problème lors de la création :", ticketResponse.status, ticketResponse.data);
                }
            } else {
                console.error("Impossible de récupérer le session token :", sessionResponse.data);
            }
        } catch (error) {
            console.error("Erreur lors de la communication avec l'API :", error.message);
        }
    
        console.log("Fin de la tâche de service");
    }

    async pollWorkflowStatus(input, context, maxRetries = 10, interval = 5000) {
        try {
            console.log("Input:", input);
            console.log("Context.item.id:", context?.item?.id);
            
            const server = context?.appDelegate?.server || this.appDelegate?.server;
            if (!server) {
                console.error("Erreur: Impossible d'accéder au serveur BPMN.");
                return null;
            }
            
            const itemId = context?.item?.id;
            const processName = context?.item?.element?.process?.name || context?.item?.token?.processId;
            
            console.log(`Démarrage du polling pour le processus: ${processName}`);
            
            let attempt = 0;
            while (attempt < maxRetries) {
                try {
                    console.log(`Tentative ${attempt+1}/${maxRetries}`);
                    
                    let instances = [];
                    try {
                        const query = { "name": processName, "status": "running" };
                        console.log("Recherche d'instances en cours avec:", JSON.stringify(query));
                        instances = await server.engine.get(query);
                    } catch (err) {
                        console.error("Erreur lors de la recherche d'instances en cours:", err.message);
                    }
                    
                    if (instances && instances.length > 0) {
                        console.log(`${instances.length} instances en cours trouvées`);
                    } else {
                        try {
                            const completedQuery = { "name": processName, "status": "end" };
                            console.log("Recherche d'instances terminées avec:", JSON.stringify(completedQuery));
                            const completedInstances = await server.engine.get(completedQuery);
                            
                            if (completedInstances && completedInstances.length > 0) {
                                console.log("Processus terminé trouvé.");
                                return completedInstances[0];
                            } else {
                                console.log("Aucune instance terminée trouvée.");
                            }
                        } catch (err) {
                            console.error("Erreur lors de la recherche d'instances terminées:", err.message);
                        }
                    }
                    
                    console.log("Attente avant la prochaine tentative...");
                    await delay(interval);
                    attempt++;
                } catch (error) {
                    console.error(`Erreur lors du polling: ${error.message}`);
                    attempt++;
                    await delay(interval);
                }
            }
            
            console.log(`Le polling a atteint le nombre maximal de tentatives (${maxRetries}).`);
            return null;
        } catch (error) {
            console.error("Erreur globale dans la fonction pollWorkflowStatus:", error.message);
            return null;
        }
    }
    async raiseBPMNError(input, context) {
        return({bpmnError:' Something went wrong'});
    }
}
export { AppServices }
