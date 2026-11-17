import { Definition, BPMNServer, IItemData } from 'bpmn-server';

export async function recoverPollingTasks(server: BPMNServer, startedAt: Date): Promise<void> {
    const serverId = process.env.SERVER_ID === undefined ? null : process.env.SERVER_ID;
    await server.dataStore.locker.delete({ server: serverId, time: { $lte: startedAt } });
    const items = await server.dataStore.findItems({ 'items.status': 'start' });
    const instances = new Map<string, IItemData[]>();
    for (const item of items) {
        const group = instances.get(item.instanceId) || [];
        group.push(item);
        instances.set(item.instanceId, group);
    }

    for (const [instanceId, interrupted] of instances) {
        try {
            const instance = await server.dataStore.findInstance({ id: instanceId }, 'full');
            if (instance.status !== 'running') {
                continue;
            }
            const source = instance.source || await server.definitions.getSource(instance.name);
            const definition = new Definition(instance.name, source, server);
            await definition.load();

            const polling = interrupted.filter(item => {
                const node = definition.getNodeById(item.elementId);
                return item.type === 'bpmn:ServiceTask' && node &&
                    node.type === 'bpmn:ServiceTask' && node['serviceName'] === 'pollTicketValidation';
            });
            for (const item of interrupted.filter(item => !polling.includes(item))) {
                console.warn(`Interrupted task '${item.elementId}' (${item.type}) in instance '${instanceId}' requires manual recovery; it was not replayed.`);
            }
            if (polling.length === 0) {
                continue;
            }
            if (interrupted.length !== 1) {
                console.warn(`Polling recovery skipped for instance '${instanceId}': multiple interrupted tasks require manual recovery.`);
                continue;
            }
            const item = polling[0];
            if (new Date(item.startedAt).getTime() > startedAt.getTime()) {
                continue;
            }

            const locks = await server.dataStore.locker.list();
            const lock = locks.find(lock => lock.id === instanceId);
            const ownedLock = !lock || lock.server === serverId || (serverId === null && lock.server == null);
            if (lock && (!ownedLock || new Date(lock.time).getTime() > startedAt.getTime())) {
                console.warn(`Polling recovery skipped for instance '${instanceId}': its lock belongs to another server or was acquired after startup.`);
                continue;
            }
            console.log(`Recovering polling task '${item.elementId}' in instance '${instanceId}'.`);
            void server.engine.invoke({ 'items.id': item.id }, {}, null, { recover: true })
                .catch(error => console.error(`Polling recovery failed for item '${item.id}' in instance '${instanceId}':`, error));
        } catch (error) {
            console.error(`Could not prepare recovery for instance '${instanceId}':`, error);
        }
    }
}
