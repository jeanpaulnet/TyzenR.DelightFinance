import { db } from './firebase';
import { collection, addDoc } from 'firebase/firestore';

export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "SOFT_DELETE" | "VIEW" | "IMPORT" | "EXPORT" | "INVITE" | "LOGIN";
export type ResourceType = "expense" | "budget" | "account" | "investment" | "user_config" | "dashboard" | "ai_assistant" | "business" | "import_rule";

interface AuditEvent {
  userId: string;
  userEmail: string;
  userName: string;
  action: AuditAction;
  resourceType: ResourceType;
  resourceId?: string;
  resourceName?: string;
  details?: string;
}

export const logEvent = async (event: AuditEvent) => {
  try {
    await addDoc(collection(db, 'audit_logs'), {
      ...event,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Failed to log audit event:", error);
  }
};
