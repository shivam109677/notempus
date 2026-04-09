export type DomainEventName =
  | "match.requested"
  | "match.proposed"
  | "match.accepted"
  | "match.rejected"
  | "session.created"
  | "session.connected"
  | "billing.tick"
  | "billing.stopped"
  | "wallet.debited"
  | "wallet.credited"
  | "report.created";

export interface DomainEvent<T = Record<string, unknown>> {
  id: string;
  name: DomainEventName;
  occurredAt: string;
  payload: T;
}
