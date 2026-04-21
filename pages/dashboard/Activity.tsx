import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Lock,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Shield,
  Key,
  Fingerprint,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/useToast';
import { api } from '@/lib/api';

const resetPasswordSchema = z.object({
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password is too long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;

interface PasswordStrength {
  score: number;
  label: string;
  color: string;
  feedback: string[];
}

export const ResetPasswordPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<PasswordStrength>({
    score: 0,
    label: 'Very Weak',
    color: 'bg-red-500',
    feedback: []
  });
  const [token, setToken] = useState<string | null>(null);
  const [isTokenValid, setIsTokenValid] = useState<boolean | null>(null);
  const [countdown, setCountdown] = useState(0);
  
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isValid, touchedFields },
  } = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
    mode: 'onChange',
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  const password = watch('password');

  // Extract token from URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tokenParam = params.get('token');
    
    if (!tokenParam) {
      setError('Invalid or missing reset token');
      setIsTokenValid(false);
      return;
    }
    
    setToken(tokenParam);
    validateToken(tokenParam);
  }, [location]);

  // Countdown timer for redirect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    } else if (countdown === 0 && isSuccess) {
      setTimeout(() => navigate('/login'), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown, isSuccess, navigate]);

  // Calculate password strength
  useEffect(() => {
    if (!password) {
      setPasswordStrength({
        score: 0,
        label: 'Very Weak',
        color: 'bg-red-500',
        feedback: []
      });
      return;
    }
    
    let score = 0;
    const feedback: string[] = [];
    
    // Length check
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    if (password.length < 8) feedback.push('Use at least 8 characters');
    
    // Character variety
    if (/[A-Z]/.test(password)) score += 1;
    else feedback.push('Add uppercase letters');
    
    if (/[a-z]/.test(password)) score += 1;
    else feedback.push('Add lowercase letters');
    
    if (/[0-9]/.test(password)) score += 1;
    else feedback.push('Add numbers');
    
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    else feedback.push('Add special characters (!@#$%^&*)');
    
    // Additional strength factors
    if (/(.)\1{2,}/.test(password)) score -= 1;
    if (/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/.test(password)) score += 1;
    
    // Normalize score to 0-4 range
    score = Math.min(4, Math.max(0, score));
    
    const strengthMap = {
      0: { label: 'Very Weak', color: 'bg-red-500' },
      1: { label: 'Weak', color: 'bg-orange-500' },
      2: { label: 'Fair', color: 'bg-yellow-500' },
      3: { label: 'Good', color: 'bg-blue-500' },
      4: { label: 'Strong', color: 'bg-green-500' }
    };
    
    setPasswordStrength({
      score,
      ...strengthMap[score as keyof typeof strengthMap],
      feedback
    });
  }, [password]);

  const validateToken = async (resetToken: string) => {
    try {
      setIsLoading(true);
      const response = await api.post('/auth/validate-reset-token', { token: resetToken });
      
      if (response.data.valid) {
        setIsTokenValid(true);
        toast({
          title: 'Token verified',
          description: 'Please enter your new password.',
        });
      } else {
        setIsTokenValid(false);
        setError('This reset link has expired or is invalid. Please request a new one.');
      }
    } catch (error: any) {
      setIsTokenValid(false);
      setError(error.response?.data?.message || 'Invalid or expired reset token');
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = async (data: ResetPasswordForm) => {
    if (!token) {
      setError('Invalid reset token');
      return;
    }
    
    if (passwordStrength.score < 3) {
      toast({
        title: 'Weak password',
        description: 'Please choose a stronger password for better security.',
        variant: 'destructive',
      });
      return;
    }
    
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await api.post('/auth/reset-password', {
        token,
        newPassword: data.password,
        confirmPassword: data.confirmPassword,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent
      });
      
      setIsSuccess(true);
      setCountdown(5);
      
      toast({
        title: 'Password reset successful!',
        description: 'Your password has been updated. Redirecting to login...',
        duration: 5000,
      });
      
      // Log successful password reset
      console.log('Password reset successful for user');
      
    } catch (error: any) {
      let errorMessage = 'Failed to reset password. Please try again.';
      
      if (error.response?.status === 400) {
        errorMessage = error.response.data.message || 'Invalid request. Please check your input.';
      } else if (error.response?.status === 401) {
        errorMessage = 'This reset link has expired. Please request a new one.';
        setTimeout(() => navigate('/forgot-password'), 3000);
      } else if (error.response?.status === 429) {
        errorMessage = 'Too many attempts. Please wait before trying again.';
      }
      
      setError(errorMessage);
      
      toast({
        title: 'Reset failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendLink = () => {
    navigate('/forgot-password');
  };

  // Loading state
  if (isLoading && isTokenValid === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
              <p className="text-gray-600 dark:text-gray-400">Verifying reset link...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Invalid token state
  if (isTokenValid === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-10 h-10 text-red-600 dark:text-red-400" />
              </div>
            </div>
            <CardTitle className="text-2xl">Invalid Reset Link</CardTitle>
            <CardDescription>
              This password reset link is invalid or has expired
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Reset links expire after 1 hour for security reasons. Please request a new password reset link.
              </AlertDescription>
            </Alert>
            
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
              <h4 className="font-medium text-sm">Possible reasons:</h4>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                <li>• The link has expired (valid for 1 hour)</li>
                <li>• The link has already been used</li>
                <li>• The link was incorrectly copied</li>
                <li>• The reset token is invalid</li>
              </ul>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-3">
            <Button onClick={handleResendLink} className="w-full">
              Request New Reset Link
            </Button>
            <Button onClick={() => navigate('/login')} variant="outline" className="w-full">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Login
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Success state
  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center animate-bounce">
                <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <CardTitle className="text-2xl">Password Reset Successful!</CardTitle>
            <CardDescription>
              Your password has been updated successfully
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription>
                You can now log in with your new password. Redirecting in {countdown} seconds...
              </AlertDescription>
            </Alert>
            
            <div className="space-y-2">
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-green-600 h-2 rounded-full transition-all duration-1000"
                  style={{ width: `${(5 - countdown) * 20}%` }}
                />
              </div>
              <p className="text-xs text-center text-gray-500">
                For security, please log in again with your new password
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={() => navigate('/login')} className="w-full">
              Go to Login
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Main form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="w-full max-w-md p-4">
        <Card className="shadow-xl">
          <CardHeader className="space-y-1">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
                <Key className="w-8 h-8 text-white" />
              </div>
            </div>
            <CardTitle className="text-2xl text-center">Create New Password</CardTitle>
            <CardDescription className="text-center">
              Choose a strong password for your account
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* New Password Field */}
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your new password"
                    className="pl-10 pr-10"
                    disabled={isLoading}
                    autoComplete="new-password"
                    {...register('password')}
                    error={errors.password?.message}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                
                {/* Password Strength Meter */}
                {password && (
                  <div className="space-y-2 mt-2">
                    <div className="flex justify-between items-center text-xs">
                      <span>Password Strength:</span>
                      <span className={`font-medium ${
                        passwordStrength.score === 4 ? 'text-green-600' :
                        passwordStrength.score === 3 ? 'text-blue-600' :
                        passwordStrength.score === 2 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {passwordStrength.label}
                      </span>
                    </div>
                    <Progress value={(passwordStrength.score / 4) * 100} className={passwordStrength.color} />
                    
                    {passwordStrength.score < 3 && passwordStrength.feedback.length > 0 && (
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-2 space-y-1">
                        <p className="font-medium">Tips to improve:</p>
                        <ul className="list-disc list-inside space-y-0.5">
                          {passwordStrength.feedback.slice(0, 3).map((tip, index) => (
                            <li key={index}>{tip}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                
                {errors.password && (
                  <p className="text-sm text-red-500">{errors.password.message}</p>
                )}
              </div>
              
              {/* Confirm Password Field */}
              <div className="space-y-2">
                <label htmlFor="confirmPassword" className="text-sm font-medium">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm your new password"
                    className="pl-10 pr-10"
                    disabled={isLoading}
                    autoComplete="new-password"
                    {...register('confirmPassword')}
                    error={errors.confirmPassword?.message}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="text-sm text-red-500">{errors.confirmPassword.message}</p>
                )}
              </div>
              
              {/* Security Tips */}
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium">Password Requirements:</span>
                </div>
                <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 ml-6 list-disc">
                  <li>At least 8 characters long</li>
                  <li>Contains uppercase and lowercase letters</li>
                  <li>Includes at least one number</li>
                  <li>Has at least one special character (!@#$%^&*)</li>
                </ul>
              </div>
              
              <Button 
                type="submit" 
                className="w-full" 
                disabled={isLoading || !isValid || passwordStrength.score < 2}
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resetting Password...
                  </>
                ) : (
                  'Reset Password'
                )}
              </Button>
            </form>
          </CardContent>
          
          <CardFooter className="flex justify-center">
            <Button
              onClick={() => navigate('/login')}
              variant="ghost"
              className="w-full"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Login
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};