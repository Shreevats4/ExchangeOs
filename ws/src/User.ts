import { WebSocket } from "ws";
import { OutgoingMessage } from "./types/out";
import { SubscriptionManager } from "./SubscriptionManager";
import { IncomingMessage, SUBSCRIBE, UNSUBSCRIBE } from "./types/in";

export class User {
    private id: string;
    private ws: WebSocket;
    private subscriptions: string[] = [];
    private userId: string | null = null; // Track authenticated user for user-specific subscriptions

    constructor(id: string, ws: WebSocket) {
        this.id = id;
        this.ws = ws;
        this.addListeners();
    }

    public subscribe(subscription: string) {
        this.subscriptions.push(subscription);
    }

    public unsubscribe(subscription: string) {
        this.subscriptions = this.subscriptions.filter(s => s !== subscription);
    }

    emit(message: OutgoingMessage) {
        this.ws.send(JSON.stringify(message));
    }

    private addListeners() {
        this.ws.on("message", (message: string) => {
            const parsedMessage: IncomingMessage = JSON.parse(message);
            
            if (parsedMessage.method === SUBSCRIBE) {
                parsedMessage.params.forEach(s => {
                    // Handle user-specific trade subscriptions
                    if (s.startsWith("userTrades@")) {
                        const userId = s.split("@")[1];
                        this.userId = userId;
                        console.log(`User ${this.id} subscribed to userTrades for userId: ${userId}`);
                    }
                    
                    // Subscribe to the channel
                    SubscriptionManager.getInstance().subscribe(this.id, s);
                    this.subscribe(s);
                });
            }

            if (parsedMessage.method === UNSUBSCRIBE) {
                parsedMessage.params.forEach(s => {
                    SubscriptionManager.getInstance().unsubscribe(this.id, s);
                    this.unsubscribe(s);
                });
            }
        });
    }

    public getId(): string {
        return this.id;
    }

    public getUserId(): string | null {
        return this.userId;
    }

    public getSubscriptions(): string[] {
        return this.subscriptions;
    }
}
