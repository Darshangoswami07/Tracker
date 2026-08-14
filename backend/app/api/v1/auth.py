"""Authentication endpoints."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Request

from app.api.deps import get_user_agent
from app.models.enums import UserRole
from app.schemas.auth import (
    AuthResponse,
    CustomerRegisterRequest,
    ForgotPasswordRequest,
    LoginRequest,
    LogoutRequest,
    LoginFlowResponse,
    RefreshRequest,
    RegisterRequest,
    ResumeRegistrationResponse,
    ResetPasswordRequest,
    UserOut,
)
from app.services.auth_service import auth_service
from app.services.registration_service import registration_service
from app.services.token_service import token_service
from app.utils.responses import success

router = APIRouter(prefix="/auth", tags=["authentication"])

UserAgent = Annotated[str | None, Depends(get_user_agent)]


@router.post("/register")
async def register(
    payload: RegisterRequest,
    user_agent: UserAgent,
    background_tasks: BackgroundTasks,
) -> dict:
    result = await registration_service.create_registration_request(
        first_name=payload.fullName.split(" ")[0] if " " in payload.fullName else payload.fullName,
        last_name=" ".join(payload.fullName.split(" ")[1:]) if " " in payload.fullName else "",
        company_name=payload.companyName or "",
        email=payload.email,
        phone=payload.phone,
        password=payload.password,
        requested_role=UserRole(payload.requestedRole),
        company_id=payload.companyId,
    )

    # Email notifications are side effects — background them so SMTP (Gmail
    # quota errors, timeouts) can never block a successful registration.
    if result.request is not None:
        background_tasks.add_task(
            registration_service.notify_admin_of_registration, result.request
        )
    if result.otp:
        background_tasks.add_task(
            registration_service.send_user_otp_email, result.request, result.otp
        )

    if result.flow == "login":
        return success(
            LoginFlowResponse(flow="login", message=result.message).model_dump(mode="json"),
            message=result.message,
        )
    
    return success(
        ResumeRegistrationResponse(
            flow=result.flow,
            status=result.status,
            registration_id=result.registration_id,
            email=result.email,
            message=result.message,
        ).model_dump(mode="json"),
        message=result.message,
    )


@router.post("/register/customer")
async def register_customer(payload: CustomerRegisterRequest, user_agent: UserAgent) -> dict:
    """Self-service signup for customer accounts (no admin approval, no company).

    Returns an authenticated session immediately so the customer lands on
    their dashboard right after creating the account.
    """
    user = await registration_service.create_customer_account(
        first_name=payload.firstName,
        last_name=payload.lastName,
        email=payload.email,
        phone=payload.phone,
        password=payload.password,
    )
    tokens = await token_service.issue_tokens(user, user_agent=user_agent)
    return success(
        AuthResponse(user=UserOut.model_validate(user), tokens=tokens).model_dump(mode="json"),
        message="Account created successfully.",
    )


@router.post("/login")
async def login(payload: LoginRequest, user_agent: UserAgent) -> dict:
    result: AuthResponse = await auth_service.login(payload.email, payload.password, role=payload.role, user_agent=user_agent)
    return success(result.model_dump(mode="json"), message="Signed in successfully.")


@router.post("/logout")
async def logout(payload: LogoutRequest) -> dict:
    await auth_service.logout(payload.refreshToken)
    return success(None, message="Signed out successfully.")


@router.post("/refresh")
async def refresh(payload: RefreshRequest, user_agent: UserAgent) -> dict:
    result: AuthResponse = await auth_service.refresh(payload.refreshToken, user_agent=user_agent)
    return success(result.model_dump(mode="json"), message="Session refreshed.")


@router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest) -> dict:
    result = await auth_service.forgot_password(payload.email)
    return success(result, message=result["message"])


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest) -> dict:
    await auth_service.reset_password(payload.token, payload.password)
    return success(None, message="Password updated successfully. You can sign in now.")