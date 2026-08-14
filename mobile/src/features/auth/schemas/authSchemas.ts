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
  .regex(/^\+?[0-9]{10,15}$/, { message: 'Enter a valid phone number.' });

const otp = z
  .string({ message: 'OTP is required.' })
  .length(6, { message: 'OTP must be 6 digits.' })
  .regex(/^\d{6}$/, { message: 'OTP must be 6 digits.' });

export const loginSchema = z.object({
  email,
  password,
  rememberMe: z.boolean(),
});

/** Which account a user picked on the role-selection screen (Customer/Staff/Driver/Admin). */
export type { RegisterAccountType };

export const requestedRole = z.enum(['employee', 'driver', 'admin']);

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
    companyId: z.string().optional(),
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
    // Admin types their own company (the backend creates/finds it).
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
    }
    // Staff/Driver must pick a company from the list.
    else if (accountType === 'staff' || accountType === 'driver') {
      if (!values.companyId || values.companyId.trim().length === 0) {
        ctx.addIssue({
          path: ['companyId'],
          code: 'custom',
          message: 'Please select a company.',
        });
      }
    }
    // Customers never carry a company, so no extra validation applies.
  });

/** Backwards-compatible alias: an employee/staff signup form. */
export const registerSchema = registerSchemaFor('staff');

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