import bcrypt from 'bcryptjs';
import { Role, UserSession } from '../types';

// ==============================================================================
// PASSWORD SECURITY
// ==============================================================================

export async function hashPassword(plainText: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plainText, salt);
}

export async function verifyPassword(plainText: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plainText, passwordHash);
}

// ==============================================================================
// ROLE-BASED ACCESS CONTROL (RBAC) — DENY BY DEFAULT
// ==============================================================================

const ROLE_RANKS: Record<Role, number> = {
  STUDENT: 1,
  CONTENT_MANAGER: 2,
  PAYMENT_VERIFIER: 3,
  ADMIN: 4,
};

/**
 * Verifies if user has sufficient privileges. Deny by default.
 */
export function hasRequiredRole(userRole: Role, requiredRole: Role): boolean {
  if (userRole === 'ADMIN') return true; // Superuser override
  if (userRole === requiredRole) return true;
  return ROLE_RANKS[userRole] >= ROLE_RANKS[requiredRole];
}

export function canManagePayments(role: Role): boolean {
  return role === 'ADMIN' || role === 'PAYMENT_VERIFIER';
}

export function canManageContent(role: Role): boolean {
  return role === 'ADMIN' || role === 'CONTENT_MANAGER';
}

export function canManageUsers(role: Role): boolean {
  return role === 'ADMIN';
}

export function canManageSettings(role: Role): boolean {
  return role === 'ADMIN';
}

// ==============================================================================
// SESSION & WATERMARK UTILITIES
// ==============================================================================

export function generateWatermarkText(user: UserSession, ipAddress?: string): string {
  const dateStr = new Date().toISOString().split('T')[0];
  const identifier = user.studentId || user.email || user.fullName;
  const ip = ipAddress ? ` · ${ipAddress}` : '';
  return `${user.fullName.toUpperCase()} · ${identifier} · ${dateStr}${ip}`;
}

export function maskPhoneNumber(phone?: string | null): string {
  if (!phone) return '—';
  // e.g., +251 911 234 821 -> +251 91•••4821
  const clean = phone.replace(/\s+/g, '');
  if (clean.length < 8) return phone;
  return `${clean.slice(0, 6)}••••${clean.slice(-4)}`;
}

export function maskEmail(email?: string | null): string {
  if (!email) return '—';
  const parts = email.split('@');
  if (parts.length !== 2) return email;
  const name = parts[0];
  const maskedName = name.length <= 2 ? `${name}*` : `${name[0]}•••${name.slice(-1)}`;
  return `${maskedName}@${parts[1]}`;
}
