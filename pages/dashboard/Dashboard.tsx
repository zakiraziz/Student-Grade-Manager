import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Shield,
  Smartphone,
  Mail,
  Fingerprint,
  Key,
  AlertCircle,
  Loader2,
  CheckCircle,
  RefreshCw,
  Copy,
  Download,
  ArrowLeft,
  QrCode,
  Clock,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/useToast';
import { api } from '@/lib/api';
import QRCode from 'qrcode.react';

const verifyCodeSchema = z.object({
  code: z.string()
    .length(6, 'Verification code must be 6 digits')
    .regex(/^\d+$/, 'Code must contain only numbers'),
});

type VerifyCodeForm = z.infer<typeof verifyCodeSchema>;

interface BackupCode {
  code: string;
  used: boolean;
}

export const TwoFactorAuthPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSetup, setIsSetup] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string>('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [backupCodes, setBackupCodes] = useState<BackupCode[]>([]);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [method, setMethod] = useState<'authenticator' | 'sms' | 'email'>('authenticator');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [smsCode, setSmsCode] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [rememberDevice, setRememberDevice] = useState(false);
  const [trustedDevices, setTrustedDevices] = useState<string[]>([]);
  
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const codeInputRef = useRef<HTMLInputElement>(null);
  
  const from = (location.state as any)?.from?.pathname || '/dashboard';
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch
  } = useForm<VerifyCodeForm>({
    resolver: zodResolver(verifyCodeSchema),
    defaultValues: {
      code: '',
    },
  });
  
  const code = watch('code');
  
  // Countdown for resend
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);
  
  // Initialize 2FA setup
  useEffect(() => {
    const init2FA = async () => {
      try {
        setIsLoading(true);
        const response = await api.post('/auth/2fa/setup');
        setSecret(response.data.secret);
        setQrCodeUrl(response.data.qrCodeUrl);
        setBackupCodes(response.data.backupCodes.map((code: string) => ({ code, used: false })));
        
        // Get trusted devices
        const devicesResponse = await api.get('/auth/2fa/trusted-devices');
        setTrustedDevices(devicesResponse.data.devices);
      } catch (error) {
        setError('Failed to initialize 2FA setup');
      } finally {
        setIsLoading(false);
      }
    };
    
    init2FA();
  }, []);
  
  const onVerifyCode = async (data: VerifyCodeForm) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await api.post('/auth/2fa/verify', {
        code: data.code,
        method,
        rememberDevice,
        deviceInfo: {
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString()
        }
      });
      
      if (response.data.verified) {
        setIsVerified(true);
        
        if (method === 'authenticator') {
          toast({
            title: '2FA Enabled Successfully',
            description: 'Your account is now more secure with two-factor authentication.',
          });
          
          // Show backup codes
          setShowBackupCodes(true);
        } else {
          toast({
            title: 'Verification Successful',
            description: 'You have been verified successfully.',
          });
          
          setTimeout(() => navigate(from, { replace: true }), 2000);
        }
      } else {
        setError('Invalid verification code. Please try again.');
      }
    } catch (error: any) {
      setError(error.response?.data?.message || 'Verification failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleSendSMSCode = async () => {
    if (!phoneNumber || phoneNumber.length < 10) {
      setError('Please enter a valid phone number');
      return;
    }
    
    try {
      setIsLoading(true);
      await api.post('/auth/2fa/send-sms', { phoneNumber });
      setCountdown(60);
      setIsPhoneVerified(true);
      toast({
        title: 'Code Sent',
        description: `Verification code sent to ${phoneNumber}`,
      });
    } catch (error) {
      setError('Failed to send SMS code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleSendEmailCode = async () => {
    if (!recoveryEmail || !recoveryEmail.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }
    
    try {
      setIsLoading(true);
      await api.post('/auth/2fa/send-email', { email: recoveryEmail });
      setCountdown(60);
      toast({
        title: 'Code Sent',
        description: `Verification code sent to ${recoveryEmail}`,
      });
    } catch (error) {
      setError('Failed to send email code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleResendCode = async () => {
    if (countdown > 0) return;
    
    if (method === 'sms') {
      await handleSendSMSCode();
    } else if (method === 'email') {
      await handleSendEmailCode();
    }
  };
  
  const copyBackupCodes = () => {
    const codesText = backupCodes.map(bc => bc.code).join('\n');
    navigator.clipboard.writeText(codesText);
    toast({
      title: 'Copied!',
      description: 'Backup codes copied to clipboard',
    });
  };
  
  const downloadBackupCodes = () => {
    const codesText = backupCodes.map(bc => bc.code).join('\n');
    const blob = new Blob([codesText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
    
    toast({
      title: 'Downloaded',
      description: 'Backup codes saved to your device',
    });
  };
  
  const handleContinueToApp = () => {
    navigate(from, { replace: true });
  };
  
  // Success with backup codes view
  if (showBackupCodes && method === 'authenticator') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
        <Card className="w-full max-w-2xl shadow-xl">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <Shield className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <CardTitle className="text-2xl">Save Your Backup Codes</CardTitle>
            <CardDescription>
              These codes can be used to access your account if you lose your phone
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <Alert variant="default" className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-sm">
                <strong>Important:</strong> Save these backup codes in a secure place. 
                Each code can only be used once, and you won't be able to see them again.
              </AlertDescription>
            </Alert>
            
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
              <div className="grid grid-cols-2 gap-3">
                {backupCodes.map((backupCode, index) => (
                  <div
                    key={index}
                    className="font-mono text-sm bg-white dark:bg-gray-900 p-2 rounded border text-center"
                  >
                    {backupCode.code}
                  </div>
                ))}
              </div>
            </div>
            
            <div className="flex gap-3 justify-center">
              <Button onClick={copyBackupCodes} variant="outline">
                <Copy className="mr-2 h-4 w-4" />
                Copy Codes
              </Button>
              <Button onClick={downloadBackupCodes} variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
            </div>
          </CardContent>
          
          <CardFooter>
            <Button onClick={handleContinueToApp} className="w-full">
              I've Saved My Codes & Continue
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }
  
  // Verified success view
  if (isVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center animate-bounce">
                <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <CardTitle className="text-2xl">Verification Successful!</CardTitle>
            <CardDescription>
              Redirecting you to your account...
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
              <div className="bg-green-600 h-2 rounded-full animate-pulse" style={{ width: '100%' }} />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // Main 2FA setup view
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="w-full max-w-2xl">
        <Card className="shadow-xl">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
                <Shield className="w-8 h-8 text-white" />
              </div>
            </div>
            <CardTitle className="text-2xl text-center">Two-Factor Authentication</CardTitle>
            <CardDescription className="text-center">
              Add an extra layer of security to your account
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <Tabs value={method} onValueChange={(v) => setMethod(v as any)} className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-6">
                <TabsTrigger value="authenticator">
                  <Smartphone className="mr-2 h-4 w-4" />
                  Authenticator
                </TabsTrigger>
                <TabsTrigger value="sms">
                  <Mail className="mr-2 h-4 w-4" />
                  SMS
                </TabsTrigger>
                <TabsTrigger value="email">
                  <Mail className="mr-2 h-4 w-4" />
                  Email
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="authenticator">
                <div className="space-y-6">
                  <div className="text-center space-y-2">
                    <h3 className="font-semibold">Scan QR Code</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                    </p>
                  </div>
                  
                  <div className="flex justify-center">
                    {qrCodeUrl && (
                      <div className="bg-white p-4 rounded-lg">
                        <QRCode value={qrCodeUrl} size={200} />
                      </div>
                    )}
                  </div>
                  
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <p className="text-xs text-center text-gray-600 dark:text-gray-400 mb-2">
                                      Or enter this code manually:
                    </p>
                    <code className="block text-center font-mono text-sm bg-white dark:bg-gray-900 p-2 rounded">
                      {secret}
                    </code>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Enter 6-digit code</label>
                    <Input
                      ref={codeInputRef}
                      type="text"
                      maxLength={6}
                      placeholder="000000"
                      className="text-center text-2xl font-mono tracking-widest"
                      {...register('code')}
                      error={errors.code?.message}
                      autoFocus
                    />
                    {errors.code && (
                      <p className="text-sm text-red-500">{errors.code.message}</p>
                    )}
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="sms">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Phone Number</label>
                    <div className="flex gap-2">
                      <Input
                        type="tel"
                        placeholder="+1 234 567 8900"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        disabled={isPhoneVerified}
                      />
                      <Button
                        onClick={handleSendSMSCode}
                        disabled={isPhoneVerified || countdown > 0}
                        variant="outline"
                      >
                        {countdown > 0 ? `${countdown}s` : 'Send Code'}
                      </Button>
                    </div>
                  </div>
                  
                  {isPhoneVerified && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Verification Code</label>
                      <Input
                        type="text"
                        maxLength={6}
                        placeholder="Enter 6-digit code"
                        value={smsCode}
                        onChange={(e) => {
                          setSmsCode(e.target.value);
                          setValue('code', e.target.value);
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleResendCode}
                        className="text-xs text-blue-600 hover:text-blue-700"
                        disabled={countdown > 0}
                      >
                        {countdown > 0 ? `Resend in ${countdown}s` : 'Resend code'}
                      </button>
                    </div>
                  )}
                </div>
              </TabsContent>
              
              <TabsContent value="email">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Recovery Email</label>
                    <div className="flex gap-2">
                      <Input
                        type="email"
                        placeholder="backup@example.com"
                        value={recoveryEmail}
                        onChange={(e) => setRecoveryEmail(e.target.value)}
                        disabled={isPhoneVerified}
                      />
                      <Button
                        onClick={handleSendEmailCode}
                        disabled={isPhoneVerified || countdown > 0}
                        variant="outline"
                      >
                        {countdown > 0 ? `${countdown}s` : 'Send Code'}
                      </Button>
                    </div>
                  </div>
                  
                  {isPhoneVerified && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Verification Code</label>
                      <Input
                        type="text"
                        maxLength={6}
                        placeholder="Enter 6-digit code"
                        {...register('code')}
                      />
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
            
            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <div className="mt-6 flex items-center space-x-2">
              <input
                type="checkbox"
                id="rememberDevice"
                checked={rememberDevice}
                onChange={(e) => setRememberDevice(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="rememberDevice" className="text-sm text-gray-600 dark:text-gray-400">
                Remember this device for 30 days
              </label>
            </div>
          </CardContent>
          
          <CardFooter className="flex flex-col space-y-3">
            <Button
              onClick={handleSubmit(onVerifyCode)}
              disabled={isLoading || (!code && method !== 'sms')}
              className="w-full"
              size="lg"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify & Enable 2FA'
              )}
            </Button>
            
            <Button
              onClick={() => navigate(-1)}
              variant="ghost"
              className="w-full"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </CardFooter>
        </Card>
        
        <div className="mt-4 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Having trouble?{' '}
            <Link to="/support" className="text-blue-600 hover:text-blue-700">
              Contact Support
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};