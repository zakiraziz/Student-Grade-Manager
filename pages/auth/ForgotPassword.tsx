import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  Mail, 
  ArrowLeft, 
  CheckCircle, 
  AlertCircle, 
  Loader2,
  Shield,
  Clock,
  HelpCircle,
  Key,
  Eye,
  EyeOff,
  Fingerprint,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/useToast';
import { api } from '@/lib/api';

const forgotPasswordSchema = z.object({
  email: z.string()
    .email('Please enter a valid email address')
    .min(1, 'Email is required')
    .max(255, 'Email is too long')
    .regex(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Please enter a valid email address'),
});

type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;

// Rate limiting helper
const useRateLimiter = (maxAttempts: number, timeWindow: number) => {
  const [attempts, setAttempts] = useState<number[]>([]);

  const canAttempt = () => {
    const now = Date.now();
    const recentAttempts = attempts.filter(time => now - time < timeWindow);
    return recentAttempts.length < maxAttempts;
  };

  const addAttempt = () => {
    const now = Date.now();
    setAttempts(prev => [...prev.slice(-maxAttempts + 1), now]);
  };

  const getRemainingAttempts = () => {
    const now = Date.now();
    const recentAttempts = attempts.filter(time => now - time < timeWindow);
    return Math.max(0, maxAttempts - recentAttempts.length);
  };

  const getResetTime = () => {
    if (attempts.length === 0) return 0;
    const now = Date.now();
    const oldestAttempt = Math.min(...attempts);
    const resetTime = oldestAttempt + timeWindow;
    return Math.max(0, resetTime - now);
  };

  return { canAttempt, addAttempt, getRemainingAttempts, getResetTime };
};

export const ForgotPasswordPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showSecurityTips, setShowSecurityTips] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [showSecurityQuestion, setShowSecurityQuestion] = useState(false);
  const [securityQuestion, setSecurityQuestion] = useState('');
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [rateLimitResetTime, setRateLimitResetTime] = useState(0);
  
  const navigate = useNavigate();
  const { toast } = useToast();
  const rateLimiter = useRateLimiter(5, 15 * 60 * 1000); // 5 attempts per 15 minutes

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, touchedFields },
  } = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
    mode: 'onChange',
  });

  const email = watch('email');

  // Countdown timer effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  // Rate limit timer effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isRateLimited && rateLimitResetTime > 0) {
      timer = setTimeout(() => {
        if (Date.now() >= rateLimitResetTime) {
          setIsRateLimited(false);
          setRateLimitResetTime(0);
        }
      }, 1000);
    }
    return () => clearTimeout(timer);
  }, [isRateLimited, rateLimitResetTime]);

  // Check for existing rate limit on component mount
  useEffect(() => {
    const lastAttempt = localStorage.getItem('lastForgotPasswordAttempt');
    const attemptTimestamp = localStorage.getItem('forgotPasswordAttempts');
    
    if (lastAttempt && attemptTimestamp) {
      const attempts = JSON.parse(attemptTimestamp);
      const now = Date.now();
      const recentAttempts = attempts.filter((time: number) => now - time < 15 * 60 * 1000);
      
      if (recentAttempts.length >= 5) {
        setIsRateLimited(true);
        const oldestAttempt = Math.min(...recentAttempts);
        setRateLimitResetTime(oldestAttempt + 15 * 60 * 1000);
      }
    }
  }, []);

  const onSubmit = async (data: ForgotPasswordForm) => {
    // Check rate limiting
    if (isRateLimited || !rateLimiter.canAttempt()) {
      const resetTime = rateLimiter.getResetTime();
      setIsRateLimited(true);
      setRateLimitResetTime(Date.now() + resetTime);
      
      toast({
        title: 'Too many attempts',
        description: `Please wait ${Math.ceil(resetTime / 60000)} minutes before trying again.`,
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      // Add attempt to rate limiter
      rateLimiter.addAttempt();
      
      // Store attempts in localStorage for persistence
      const storedAttempts = localStorage.getItem('forgotPasswordAttempts');
      const attempts = storedAttempts ? JSON.parse(storedAttempts) : [];
      attempts.push(Date.now());
      localStorage.setItem('forgotPasswordAttempts', JSON.stringify(attempts.slice(-5)));
      localStorage.setItem('lastForgotPasswordAttempt', Date.now().toString());
      
      // Increment attempt count
      setAttemptCount(prev => prev + 1);
      
      const response = await api.post('/auth/forgot-password', {
        email: data.email,
        timestamp: Date.now(),
        userAgent: navigator.userAgent,
      });
      
      // Check if security question is required
      if (response.data.requiresSecurityQuestion) {
        setSecurityQuestion(response.data.securityQuestion);
        setShowSecurityQuestion(true);
        return;
      }
      
      setIsSubmitted(true);
      setCountdown(60);
      
      toast({
        title: 'Reset email sent!',
        description: 'Please check your inbox for password reset instructions.',
      });
      
      // Log successful request (for monitoring)
      console.info('Password reset requested for:', data.email);
      
    } catch (error: any) {
      // Handle specific error cases
      if (error.response?.status === 429) {
        setIsRateLimited(true);
        setRateLimitResetTime(Date.now() + 60 * 1000);
        setError('Too many requests. Please try again in a minute.');
      } else if (error.response?.status === 404) {
        setError('No account found with this email address.');
      } else {
        setError(
          error.response?.data?.message || 
          'Failed to send reset email. Please try again.'
        );
      }
      
      toast({
        title: 'Request failed',
        description: error.response?.data?.message || 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSecurityAnswer = async () => {
    try {
      setIsLoading(true);
      
      const response = await api.post('/auth/verify-security-question', {
        email: email,
        answer: securityAnswer,
        questionId: securityQuestion,
      });
      
      if (response.data.verified) {
        setIsSubmitted(true);
        setCountdown(60);
        toast({
          title: 'Reset email sent!',
          description: 'Security verified. Check your inbox for reset instructions.',
        });
      } else {
        setError('Incorrect security answer. Please try again.');
      }
    } catch (error: any) {
      setError('Failed to verify security answer. Please try again.');
    } finally {
      setIsLoading(false);
      setShowSecurityQuestion(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    
    // Check rate limit for resend
    if (isRateLimited) {
      toast({
        title: 'Rate limited',
        description: 'Please wait before requesting another email.',
        variant: 'destructive',
      });
      return;
    }
    
    try {
      setIsLoading(true);
      setError(null);
      
      await api.post('/auth/forgot-password', {
        email: email,
        resend: true,
      });
      
      setCountdown(60);
      
      toast({
        title: 'Email resent!',
        description: 'A new reset link has been sent to your email.',
      });
    } catch (error: any) {
      setError(
        error.response?.data?.message || 
        'Failed to resend email. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue('email', e.target.value);
    setError(null);
  };

  const maskEmail = (email: string) => {
    const [localPart, domain] = email.split('@');
    const maskedLocal = localPart.slice(0, 2) + '***' + localPart.slice(-1);
    return `${maskedLocal}@${domain}`;
  };

  // Security tips component
  const SecurityTips = () => (
    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 space-y-2">
      <h4 className="font-medium text-sm flex items-center gap-2">
        <Shield className="h-4 w-4 text-blue-600" />
        Security Tips
      </h4>
      <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
        <li>• Never share your reset link with anyone</li>
        <li>• Reset links expire after 1 hour</li>
        <li>• Use a strong, unique password</li>
        <li>• Enable 2FA for extra security</li>
      </ul>
    </div>
  );

  // Rate limit warning
  if (isRateLimited) {
    const remainingMinutes = Math.ceil((rateLimitResetTime - Date.now()) / 60000);
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                <Clock className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
            </div>
            <CardTitle className="text-2xl">Too Many Attempts</CardTitle>
            <CardDescription>
              For security reasons, please wait before trying again
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-lg font-semibold text-red-600 dark:text-red-400">
              {remainingMinutes} minute{remainingMinutes !== 1 ? 's' : ''} remaining
            </p>
            <Alert className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This helps protect your account from unauthorized access attempts.
              </AlertDescription>
            </Alert>
          </CardContent>
          <CardFooter>
            <Button onClick={() => navigate('/login')} className="w-full">
              Back to Login
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Security question verification
  if (showSecurityQuestion) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                <Fingerprint className="w-8 h-8 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
            <CardTitle className="text-2xl">Security Verification</CardTitle>
            <CardDescription>
              Please answer your security question to continue
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Security Question</label>
              <p className="text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                {securityQuestion}
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor="securityAnswer" className="text-sm font-medium">
                Your Answer
              </label>
              <Input
                id="securityAnswer"
                type="text"
                value={securityAnswer}
                onChange={(e) => setSecurityAnswer(e.target.value)}
                placeholder="Enter your security answer"
                disabled={isLoading}
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="flex flex-col space-y-3">
            <Button 
              onClick={handleSecurityAnswer} 
              className="w-full"
              disabled={!securityAnswer || isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify & Send Reset Link'
              )}
            </Button>
            <Button
              onClick={() => {
                setShowSecurityQuestion(false);
                setError(null);
              }}
              variant="ghost"
              className="w-full"
            >
              Cancel
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Success state
  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="w-full max-w-md p-4">
          <Card className="shadow-xl">
            <CardHeader className="space-y-1 text-center">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center animate-pulse">
                  <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <CardTitle className="text-2xl">Check Your Email</CardTitle>
              <CardDescription>
                We've sent a password reset link to
              </CardDescription>
              <p className="font-medium text-blue-600 dark:text-blue-400 mt-2 break-all">
                {maskEmail(email)}
              </p>
            </CardHeader>
            
            <CardContent className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  The link will expire in 1 hour for security reasons.
                </AlertDescription>
              </Alert>
              
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <HelpCircle className="h-4 w-4" />
                  Didn't receive the email?
                </h4>
                <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <li className="flex items-start gap-2">
                    <span>•</span>
                    <span>Check your spam or junk folder</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>•</span>
                    <span>Make sure you entered the correct email address</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>•</span>
                    <span>The email might take a few minutes to arrive</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>•</span>
                    <span>Add no-reply@yourapp.com to your contacts</span>
                  </li>
                </ul>
              </div>
              
              <button
                onClick={() => setShowSecurityTips(!showSecurityTips)}
                className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1 mx-auto"
              >
                <Shield className="h-3 w-3" />
                {showSecurityTips ? 'Hide' : 'Show'} security tips
              </button>
              
              {showSecurityTips && <SecurityTips />}
            </CardContent>
            
            <CardFooter className="flex flex-col space-y-3">
              <Button
                onClick={handleResend}
                disabled={countdown > 0 || isLoading}
                variant="outline"
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : countdown > 0 ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Resend in {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}
                  </>
                ) : (
                  'Resend Email'
                )}
              </Button>
              
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
          
          <div className="mt-4 text-center space-y-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Need help?{' '}
              <Link to="/support" className="text-blue-600 hover:text-blue-700 font-medium">
                Contact Support
              </Link>
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Request ID: {Math.random().toString(36).substring(2, 10).toUpperCase()}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Main form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="w-full max-w-md p-4">
        <Card className="shadow-xl animate-in fade-in duration-500">
          <CardHeader className="space-y-1">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center shadow-lg">
                <Key className="w-8 h-8 text-white" />
              </div>
            </div>
            <CardTitle className="text-2xl text-center">Forgot Password?</CardTitle>
            <CardDescription className="text-center">
              No worries! Enter your email and we'll send you reset instructions.
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4 animate-in slide-in-from-top-2">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            {attemptCount > 0 && attemptCount % 3 === 0 && (
              <Alert className="mb-4 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200">
                <HelpCircle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-800 dark:text-yellow-200 text-sm">
                  Having trouble? Make sure you're using the email address associated with your account.
                </AlertDescription>
              </Alert>
            )}
            
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium flex justify-between">
                  <span>Email Address</span>
                  {touchedFields.email && !errors.email && email && (
                    <span className="text-green-600 text-xs">✓ Valid email</span>
                  )}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-blue-500"
                    disabled={isLoading}
                    {...register('email')}
                    onChange={handleEmailChange}
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? "email-error" : undefined}
                  />
                  {email && !errors.email && (
                    <CheckCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 text-green-500 w-4 h-4" />
                  )}
                </div>
                {errors.email && (
                  <p id="email-error" className="text-sm text-red-500 animate-in slide-in-from-top-1">
                    {errors.email.message}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  We'll send a password reset link to this email
                </p>
              </div>

              <Button 
                type="submit" 
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transition-all duration-200"
                disabled={isLoading || !!errors.email}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending Reset Link...
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Send Reset Link
                  </>
                )}
              </Button>
            </form>
            
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white dark:bg-gray-800 text-gray-500">
                  Remember your password?
                </span>
              </div>
            </div>
            
            <Button
              onClick={() => navigate('/login')}
              variant="outline"
              className="w-full group"
            >
              <ArrowLeft className="mr-2 h-4 w-4 group-hover:-translate-x-1 transition-transform" />
              Back to Login
            </Button>
          </CardContent>
          
          <CardFooter className="justify-center flex-col space-y-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Don't have an account?{' '}
              <Link to="/register" className="text-blue-600 hover:text-blue-700 font-medium transition-colors">
                Sign up
              </Link>
            </p>
            <button
              onClick={() => setShowSecurityTips(!showSecurityTips)}
              className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <Shield className="h-3 w-3" />
              Security Tips
            </button>
            {showSecurityTips && <SecurityTips />}
          </CardFooter>
        </Card>
        
        <div className="mt-4 text-center space-y-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            By continuing, you agree to our{' '}
            <Link to="/terms" className="text-blue-600 hover:text-blue-700 transition-colors">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className="text-blue-600 hover:text-blue-700 transition-colors">
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};
