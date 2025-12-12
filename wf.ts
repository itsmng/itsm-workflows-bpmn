
class Calculator {
	add(a:number,b:number):number {	return a+b;	}
	subtract(a:number,b:number):number {	return a-b;	}
	factorial(n:number):number {	return n==0?1:n*this.factorial(n-1);	}
	multiply(a:number,b:number):number {	return a*b;	}
}			

class Execution {
	tokens=[];
	constructor()
	{

	}
	/**
	 * to start new node execution , typically at start of process
	 */
	async execute(node:WFNode) {
		// fire the item
		await this.executeQueue();
	}
	/**
	 * to continue execution of a particular item that is in wait state
	 */
	
	async resume(item:Item) {

		// fire the item

		await this.executeQueue();

	}
	async executeQueue() {

		let active=true;
		while(active)
		{
			let promises=[];
			this.tokens.forEach(async function (t:Token) {
				if (t.status==Token_Status.running) {
					promises.push(t.execute());
				}
			});

			// check waits 
			let results=await Promise.all(promises);
			if (results.length==0) {
				active=false;
			}
		}
		// check end of process

		active=false;
		this.tokens.forEach(async function (t:Token) {
			switch(t.status) {
				case Token_Status.wait:
					active=true;
					break;

			}
		});
		if (active==false)
			this.end();
	}
	end() {
		throw new Error("Method not implemented.");
	}

}
enum Token_Status {
	running,	// only during execution
	end,		// reach its end , no further processing, item:end
	wait,		// in a wait state,	item:wait
	cancel,		// no longer needed
	diverge		// waiting for converge
}
enum Token_type {
	normal,
	diverge,
	converge,
	subprocess,
	loop,
	boundaryEvent
}
class Token {
	/**
	 * token scenarios:
	 * 	1.	normal flow
	 * 	2.	diverge (gw)  - set current on wait, start new tokens (children)
	 * 	3.	converge (gw) - close current re-instate parent
	 * 	4.	subprocess	same
	 * 	5.	loop		same
	 * 	6.	boundaryEvents 	- child of owner token, goes in a wait state and closes when parent closes
	 * 	7.	boundaryEvent Executes
	 * 	8.	boundaryEvent Executes - interupting ..
	 */
	type: Token_type;
	status:Token_Status;
	nextNode:WFNode|null;		// next node to be fired in the queue
	currentItem:Item|null;

	static createNewToken(type,startNode,parent):Token {
		return new Token(type,startNode);
	}
	constructor(type:Token_type,startNode:WFNode)
	{
		this.type=type;
		this.status=Token_Status.running;
	}
	end() {
		this.status=Token_Status.end;
	}
	wait() {
		this.status=Token_Status.wait;
	}
	async execute() {
		this.status=Token_Status.running;

		let {ret:Exec_Return,item}=this.nextNode?.execute();

		if (ret==Exec_Return.wait)
			return ret;

		let abort=false;
		switch (ret) {
			case Exec_Return.continue:
			case Exec_Return.end:
			case Exec_Return.endAbort:
			case Exec_Return.escalateAbort:
			case Exec_Return.escalate:
			case Exec_Return.error:
			case Exec_Return.cancel:
				abort=true;
				break;
		}
		if (abort) 
			return this.end();
		else 
		{
			if (this.checkLoopPending())
				return this.end();

			this.nextNode=this.getNext();

			if (this.nextNode==null) 
				return this.end();

			this.status=Token_Status.running;
			return ret;
		}

	}
	/**
	 *  checks outflows and return the node (not the flow) to be executed
	 * 		its check flow condition
	 * 		
	 * 	out flow scenarios:
	 * 		1.	single flow	- return target		- continue
	 * 		2.	multiple flows	in a exclusive gateway - return single target	- continue
	 * 		3.	multiple flows (no gateway)	- diverge
	 * 		4.	multiple flows (in parallel gateway)	- diverge
	 * @returns 
	 */
	getNext():WFNode|null {
		let outflows
		return null;
	}
	checkLoopPending():boolean {
		return false;
	}

}
enum Exec_Return {
		continue,	// normal flow
		end,
		endAbort,
		escalateAbort,
		escalate,
		error,
		cancel,
		wait
}
class WFNode {
	name:string;
	constructor(name:string)
	{
		this.name=name;
	}
	/**
	 * does start,run,end
	 */
	execute() :{ret:Exec_Return,item:Item} {

		let item=new Item();
		console.log('execute node '+this.name);
		return {ret:Exec_Return.continue,item};
	}

}
class Item {

}
function log(msg) {
	console.log(msg);
}
async function main() {
	log('starting ..');
	let exc=new Execution();
	await exc.execute();
	log('end');
}
main();