import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: { code: 'validation_error', message: 'Email and password are required' } },
        { status: 400 }
      );
    }

    // Forward to backend API. `NEXT_PUBLIC_API_URL` (when set) already
    // includes the `/api/v1` prefix, matching `src/lib/api/client.ts`'s
    // convention — this previously appended `/api/v1` a second time whenever
    // the env var was set, silently 404ing every login through this route.
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
    const response = await fetch(`${backendUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || { code: 'login_failed', message: 'Login failed' } },
        { status: response.status }
      );
    }

    // Every role may sign in to this website — each lands on a page scoped to
    // their role (Admin-tier -> /dashboard, Staff/Driver/Customer -> /tracker).
    const userRole = data.data?.user?.role;
    const allowedRoles = ['admin', 'super_admin', 'business_owner', 'dispatcher', 'employee', 'driver', 'customer'];

    if (!allowedRoles.includes(userRole)) {
      return NextResponse.json(
        { error: { code: 'forbidden', message: 'You do not have permission to access this portal' } },
        { status: 403 }
      );
    }

    // Return success with token
    return NextResponse.json({
      success: true,
      message: 'Login successful',
      data: {
        tokens: data.data.tokens,
        user: data.data.user,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: { code: 'internal_error', message: 'An unexpected error occurred' } },
      { status: 500 }
    );
  }
}