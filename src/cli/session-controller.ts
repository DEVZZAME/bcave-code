import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { newSessionId, saveSession, type Session } from "../session/store.js";

export type SessionWriter = (session: Session) => void;

export class SessionController {
  private id: string;
  private createdAt: string;
  private title = "";
  private turns = 0;

  constructor(
    private readonly write: SessionWriter = saveSession,
    createId: () => string = newSessionId,
    now: () => Date = () => new Date(),
  ) {
    this.id = createId();
    this.createdAt = now().toISOString();
  }

  persist(userMessage: string, cwd: string, messages: ChatCompletionMessageParam[], now = new Date()): Session {
    if (!this.title) this.title = userMessage.replace(/\s+/g, " ").trim().slice(0, 80);
    this.turns++;
    const session: Session = {
      id: this.id,
      createdAt: this.createdAt,
      updatedAt: now.toISOString(),
      cwd,
      title: this.title,
      turns: this.turns,
      messages,
    };
    this.write(session);
    return session;
  }

  restore(session: Session): void {
    this.id = session.id;
    this.createdAt = session.createdAt;
    this.title = session.title;
    this.turns = session.turns;
  }
}
