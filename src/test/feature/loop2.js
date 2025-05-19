
const { BPMNServer , DefaultHandler , Logger } = require('./');
const { configuration } = require('./');


const logger = new Logger({ toConsole: false});

const server = new BPMNServer(configuration, logger, { cron: false });

let name = 'Issue197';

let process;
let response;
let items;
let instances;
let caseId = 5501;
Feature('Cancel Loops', () => {

        Scenario('Normal Flow', () => {

            Given('Start', async () => {
                response = await server.engine.start(name, { caseId: caseId,scenario:' normal flow'});
            });
            Then('find 1 item waiting:', async () => {
                items= response.instance.items;
                let list=items.filter(i=>{return i.elementId=='Activity_create_vote'});
                 expect(list.length).equals(2);
            });
            Given('invoke the item:', async () => {
                console.log('invoking');
                response = await server.engine.invoke({"id":response.id, "items.elementId": 'Activity_create_vote',"items.itemKey":"HR" }, {"vote":"true"});
                report(response);
                response = await server.engine.invoke({"id":response.id, "items.elementId": 'Activity_create_vote',"items.itemKey":"IT" }, {"vote":"true"});
            });
            Then('Summary is ready:', async () => {
                let item=getItem('Activity_sum_votes');
                expect(item.status).equals('wait');
            });
            Then('Invoke:', async () => {
                response = await server.engine.invoke({"id":response.id, "items.elementId": 'Activity_sum_votes' }, {});
            });
            let fileName = __dirname + '/../logs/loop2.log';
            Then('Summary is done:', async () => {
                let item=getItem('Event_end1');
                expect(item.status).equals('end');
            });

            and('write log file to ' + fileName, async () => {
                logger.save(fileName);
                //                console.log('filename:', __filename);
            }); 

        });
/*
        Scenario('Cancel Flow', () => {

            Given('Start', async () => {
                response = await server.engine.start(name, { caseId: caseId,scenario:' normal flow'});
            });
            Then('find 1 item waiting:', async () => {
                items= response.instance.items;
                let list=items.filter(i=>{return i.elementId=='Activity_create_vote'});
                console.log(getItem('Activity_create_vote','IT').seq);
                 expect(list.length).equals(2);
            });
            Given('invoke cancel:', async () => {
                response = await server.engine.invoke({"id":response.id, "items.elementId": 'Event_cancel',"items.itemKey":"HR" }, {"vote":"true"});
            });
            Then('Delete votes ended :', async () => {
                expect(getItem('Activity_deleteVotes').status).equals('end');
                expect(getItem('Event_cancel','HR').status).equals('end');
                expect(getItem('Event_cancel','IT').status).equals('end');
            });
 
            let fileName = __dirname + '/../logs/'+name+'.log';
            Then('Summary is done:', async () => {
                let item=getItem('Event_end2','HR');
                expect(item.status).equals('end');
            });

            and('write log file to ' + fileName, async () => {
                logger.save(fileName+'-cancel');
                //                console.log('filename:', __filename);
            }); 

        });
*/
}); 
function report(response) {
    response.instance.items.forEach(item=>{
        console.log(`${item.seq}- ${item.elementId} - ${item.itemKey} - ${item.status}`);
    })
}
async function delay(time) {
    log("delaying ... " + time)
    return new Promise(function (resolve) {
        setTimeout(function () {
            log("delayed is done.");
            resolve();
        }, time);
    });
}
function log(msg) {
    logger.log(msg);
}
function listItems() {
    response.instance.items.forEach(item=>{
        console.log('>item:',item.seq,item.elementId,item.itemKey,item.status);
    });
}



function getItem(id,key=null)
{
    const items=response.instance.items.filter(function(item){

        if (id===item.elementId) {
            if (key && key===item.itemKey)
                return true;
            else
                return true;
        }
        return false;

    });

    return items[0];
}


