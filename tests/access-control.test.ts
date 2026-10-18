import { describe, it, expect } from 'vitest';
import { hasRequiredRole, canManagePayments, canManageContent, canManageUsers, generateWatermarkText } from '../src/lib/auth';
import type { UserSession, Role } from '../src/types';

describe('ExamVault Access Control (RBAC) & Security Rules', () => {
  const studentUser: UserSession = {
    userId: 'user-01',
    studentId: 'EV-20481',
    fullName: 'Abenezer Bekele',
    email: 'abenezer@example.com',
    phone: '+251911234821',
    role: 'STUDENT',
    programId: 'prog-it',
    currentYear: 3,
  };

  const verifierUser: UserSession = {
    userId: 'staff-01',
    studentId: 'STAFF-V01',
    fullName: 'Hana K. Verifier',
    email: 'verifier@examvault.edu.et',
    phone: '+251911000002',
    role: 'PAYMENT_VERIFIER',
    programId: null,
    currentYear: null,
  };

  const contentManagerUser: UserSession = {
    userId: 'staff-02',
    studentId: 'STAFF-C01',
    fullName: 'Dawit M. Content Lead',
    email: 'content@examvault.edu.et',
    phone: '+251911000003',
    role: 'CONTENT_MANAGER',
    programId: null,
    currentYear: null,
  };

  const adminUser: UserSession = {
    userId: 'admin-01',
    studentId: 'STAFF-A01',
    fullName: 'Ambo University Admin',
    email: 'admin@examvault.edu.et',
    phone: '+251911000001',
    role: 'ADMIN',
    programId: null,
    currentYear: null,
  };

  it('enforces deny-by-default for students accessing administrative resources', () => {
    expect(hasRequiredRole(studentUser.role, 'ADMIN')).toBe(false);
    expect(hasRequiredRole(studentUser.role, 'PAYMENT_VERIFIER')).toBe(false);
    expect(hasRequiredRole(studentUser.role, 'CONTENT_MANAGER')).toBe(false);
    expect(canManagePayments(studentUser.role)).toBe(false);
    expect(canManageContent(studentUser.role)).toBe(false);
    expect(canManageUsers(studentUser.role)).toBe(false);
  });

  it('allows payment verifiers to manage payments but not platform settings or users', () => {
    expect(canManagePayments(verifierUser.role)).toBe(true);
    expect(canManageContent(verifierUser.role)).toBe(false);
    expect(canManageUsers(verifierUser.role)).toBe(false);
  });

  it('allows content managers to manage exam papers and student submissions', () => {
    expect(canManageContent(contentManagerUser.role)).toBe(true);
    expect(canManagePayments(contentManagerUser.role)).toBe(false);
    expect(canManageUsers(contentManagerUser.role)).toBe(false);
  });

  it('grants full administrative permissions to ADMIN superusers', () => {
    expect(canManagePayments(adminUser.role)).toBe(true);
    expect(canManageContent(adminUser.role)).toBe(true);
    expect(canManageUsers(adminUser.role)).toBe(true);
  });

  it('generates tamper-resistant student watermark with name, student ID, and date', () => {
    const watermark = generateWatermarkText(studentUser, '197.156.103.42');
    expect(watermark).toContain('ABENEZER BEKELE');
    expect(watermark).toContain('EV-20481');
    expect(watermark).toContain(new Date().toISOString().split('T')[0]);
    expect(watermark).toContain('197.156.103.42');
  });
});
