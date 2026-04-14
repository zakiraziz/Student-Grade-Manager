import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
import logging
from app.config import settings

logger = logging.getLogger(__name__)

async def send_password_reset_email(
    email: str,
    username: str,
    token: str,
    expires_in_hours: int = 1
):
    """
    Send password reset email to user
    """
    reset_link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    
    subject = "Reset Your TaskFlow Password"
    
    # HTML Email Template
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {{
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
            }}
            .container {{
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                padding: 40px;
                border-radius: 10px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }}
            .content {{
                background: white;
                padding: 30px;
                border-radius: 8px;
                margin-top: 20px;
            }}
            h1 {{
                color: #667eea;
                margin-bottom: 20px;
            }}
            .button {{
                display: inline-block;
                padding: 12px 24px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                text-decoration: none;
                border-radius: 6px;
                font-weight: 600;
                margin: 20px 0;
            }}
            .button:hover {{
                opacity: 0.9;
            }}
            .footer {{
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid #eee;
                font-size: 12px;
                color: #666;
            }}
            .warning {{
                background: #fff3cd;
                border: 1px solid #ffeaa7;
                border-radius: 6px;
                padding: 12px;
                margin: 20px 0;
                font-size: 14px;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="content">
                <h1>Reset Your Password</h1>
                
                <p>Hello {username},</p>
                
                <p>We received a request to reset the password for your TaskFlow account. 
                Click the button below to create a new password:</p>
                
                <div style="text-align: center;">
                    <a href="{reset_link}" class="button">Reset Password</a>
                </div>
                
                <p>Or copy and paste this link into your browser:</p>
                <p style="word-break: break-all; color: #667eea;">{reset_link}</p>
                
                <div class="warning">
                    <strong>⚠️ Security Notice:</strong>
                    <ul style="margin-top: 8px; padding-left: 20px;">
                        <li>This link will expire in {expires_in_hours} hour{'' if expires_in_hours == 1 else 's'}</li>
                        <li>If you didn't request this reset, please ignore this email</li>
                        <li>Never share this link with anyone</li>
                    </ul>
                </div>
                
                <p>Best regards,<br>The TaskFlow Team</p>
                
                <div class="footer">
                    <p>This is an automated message, please do not reply to this email.</p>
                    <p>© 2024 TaskFlow. All rights reserved.</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    """
    
    # Plain text fallback
    text_content = f"""
    Reset Your TaskFlow Password
    
    Hello {username},
    
    We received a request to reset the password for your TaskFlow account.
    
    Click this link to reset your password:
    {reset_link}
    
    This link will expire in {expires_in_hours} hour{'' if expires_in_hours == 1 else 's'}.
    
    If you didn't request this reset, please ignore this email.
    
    Best regards,
    The TaskFlow Team
    """
    
    try:
        # Send email using configured email service
        await send_email(
            to_email=email,
            subject=subject,
            html_content=html_content,
            text_content=text_content
        )
        logger.info(f"Password reset email sent to {email}")
    except Exception as e:
        logger.error(f"Failed to send password reset email to {email}: {str(e)}")
        # Don't raise the exception to avoid exposing email status
        pass

async def send_email(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None
):
    """
    Send email using SMTP or email service provider
    """
    # Example using SMTP
    if settings.EMAIL_BACKEND == "smtp":
        message = MIMEMultipart("alternative")
        message["Subject"] = subject
        message["From"] = settings.EMAIL_FROM
        message["To"] = to_email
        
        # Add plain text part
        if text_content:
            part1 = MIMEText(text_content, "plain")
            message.attach(part1)
        
        # Add HTML part
        part2 = MIMEText(html_content, "html")
        message.attach(part2)
        
        # Send email
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            if settings.SMTP_USE_TLS:
                server.starttls()
            if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            server.send_message(message)
    
    # Example using SendGrid
    elif settings.EMAIL_BACKEND == "sendgrid":
        import sendgrid
        from sendgrid.helpers.mail import Mail, Email, To, Content
        
        sg = sendgrid.SendGridAPIClient(api_key=settings.SENDGRID_API_KEY)
        
        message = Mail(
            from_email=Email(settings.EMAIL_FROM),
            to_emails=To(to_email),
            subject=subject,
            html_content=Content("text/html", html_content)
        )
        
        if text_content:
            message.add_content(Content("text/plain", text_content))
        
        response = sg.send(message)
        
    # For development, just log
    else:
        logger.info(f"Email would be sent to {to_email}")
        logger.info(f"Subject: {subject}")
        logger.info(f"Content: {text_content[:200]}...")