import { z } from 'zod';
import type { RegisterAccountType } from '../types';

/** Validation schemas shared by React Hook Form and the API layer. */

const email = z.email({ message: 'Enter a valid email address.' });

const password = z
  .string({ message: 'Password is required.' })
  .min(8, { message: 'Password must be at least 8 characters.' })
  .max(72, { message: 'Password must be at most 72 characters.' });

const phone = z
  .string({ message: 'Phone number is required.' })
  .regex(/^[6-9][0-9]{9}$/, { message: 'Enter a valid 10-digit Indian mobile number' });

const otp = z
  .string({ message: 'OTP is required.' })
  .length(6, { message: 'OTP must be 6 digits.' })
  .regex(/^\d{6}$/, { message: 'OTP must be 6 digits.' });

export const loginSchema = z.object({
  email,
  password,
  rememberMe: z.boolean(),
});

/** Which account a user picked on the role-selection screen. */
export type { RegisterAccountType };

export const requestedRole = z.enum(['admin', 'staff']);

const registerBaseSchema = z
  .object({
    firstName: z
      .string({ message: 'First name is required.' })
      .min(1, { message: 'First name is required.' })
      .max(60, { message: 'First name is too long.' }),
    lastName: z
      .string({ message: 'Last name is required.' })
      .min(1, { message: 'Last name is required.' })
      .max(60, { message: 'Last name is too long.' }),
    companyName: z.string().optional(),
    area: z.string().optional(),
    email,
    phone,
    password,
    confirmPassword: z.string({ message: 'Please confirm your password.' }),
    acceptTerms: z.boolean({ message: 'You must accept the terms to continue.' }),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  })
  .refine((values) => values.acceptTerms === true, {
    path: ['acceptTerms'],
    message: 'You must accept the terms to continue.',
  });

/** Register form schema for a specific account type (the role is fixed by the
 * route, so the form never re-asks the user to pick one). */
export const registerSchemaFor = (accountType: RegisterAccountType) =>
  registerBaseSchema.superRefine((values, ctx) => {
    // Admin types their own company (the backend creates/finds it). Staff
    // has no company field — they're assigned one by the approving Admin.
    if (accountType === 'admin') {
      if (!values.companyName || values.companyName.trim().length === 0) {
        ctx.addIssue({
          path: ['companyName'],
          code: 'custom',
          message: 'Company name is required.',
        });
      } else if (values.companyName.trim().length > 160) {
        ctx.addIssue({
          path: ['companyName'],
          code: 'custom',
          message: 'Company name is too long.',
        });
      }
      return;
    }

    // Staff must select a permanent operational area — no registration
    // without one.
    if (!values.area || values.area.trim().length === 0) {
      ctx.addIssue({
        path: ['area'],
        code: 'custom',
        message: 'Please select your location.',
      });
    }
  });

export const registerSchema = registerSchemaFor('admin');

export const forgotPasswordSchema = z.object({
  email,
});

export const otpVerificationSchema = z.object({
  otp,
});

export const resendOtpSchema = z.object({
  // No fields needed for resend
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type OTPVerificationValues = z.infer<typeof otpVerificationSchema>;
export type ResendOtpValues = z.infer<typeof resendOtpSchema>;