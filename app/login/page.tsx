'use client';

import { useState, useEffect } from 'react';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { scrollToError } from '@/lib/form-utils';
import { useRouter } from 'next/navigation';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email address is required').email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Check if already logged in
    const checkUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          // If session exists, check role
          const { data: roleData } = await supabase
            .from('admin_roles')
            .select('role_name')
            .eq('user_id', session.user.id)
            .single();

          if (roleData?.role_name === 'admin' || roleData?.role_name === 'subadmin') {
            router.push('/admin/dashboard');
          }
        }
      } catch (err) {
        console.error('Session verification error:', err);
      }
    };
    checkUser();
  }, [router]);

  const validate = () => {
    const result = loginSchema.safeParse({ email, password });
    const newErrors: Record<string, string> = {};

    if (!result.success) {
      result.error.issues.forEach((issue) => {
        const fieldName = issue.path[0] as string;
        newErrors[fieldName] = issue.message;
      });
    }

    setFieldErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      scrollToError(newErrors);
      return false;
    }
    return true;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validate()) {
      return;
    }

    setLoading(true);

    try {
      // 1. Authenticate with Supabase
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) throw new Error(authError.message);
      if (!authData.user) throw new Error('No user found after authentication.');

      // 2. Check Admin / Subadmin Role
      const { data: roleData, error: roleError } = await supabase
        .from('admin_roles')
        .select('role_name')
        .eq('user_id', authData.user.id)
        .single();

      if (roleError || !roleData || !['admin', 'subadmin'].includes(roleData.role_name)) {
        // If not admin or subadmin, sign them out immediately
        await supabase.auth.signOut();
        throw new Error('Access Denied: You do not have administrative privileges.');
      }

      // 3. Success -> Redirect
      router.push('/admin/dashboard');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during login.');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-[#0e0e13] text-white flex items-center justify-center p-4 sm:p-6 lg:p-8 overflow-hidden select-none">
      
      {/* Galaxy Cosmic Background Layer */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        
        {/* Low Opacity Cosmic Texture & Mesh Overlays (Charcoal Theme) */}
        <div className="absolute inset-0 opacity-[0.04] bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:24px_24px]" />
        <div className="absolute inset-0 opacity-[0.025] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:48px_48px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-700/10 via-transparent to-zinc-900/30" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.035),transparent_65%)]" />

        {/* Twinkling Star Sparkles */}
        <svg
          viewBox="0 0 20 20"
          className="absolute text-zinc-300/70 animate-magic-sparkle"
          style={{ top: '10%', left: '12%', width: '15px', height: '15px', ['--sparkle-duration' as any]: '4.2s' }}
        >
          <path d="M10 0 Q10 10 20 10 Q10 10 10 20 Q10 10 0 10 Q10 10 10 0 Z" fill="currentColor" />
        </svg>
        <svg
          viewBox="0 0 20 20"
          className="absolute text-amber-300/60 animate-magic-sparkle"
          style={{ top: '22%', right: '14%', width: '13px', height: '13px', ['--sparkle-duration' as any]: '5s' }}
        >
          <path d="M10 0 Q10 10 20 10 Q10 10 10 20 Q10 10 0 10 Q10 10 10 0 Z" fill="currentColor" />
        </svg>
        <svg
          viewBox="0 0 20 20"
          className="absolute text-sky-300/60 animate-magic-sparkle"
          style={{ bottom: '18%', left: '16%', width: '14px', height: '14px', ['--sparkle-duration' as any]: '6s' }}
        >
          <path d="M10 0 Q10 10 20 10 Q10 10 10 20 Q10 10 0 10 Q10 10 10 0 Z" fill="currentColor" />
        </svg>
        <svg
          viewBox="0 0 20 20"
          className="absolute text-emerald-300/60 animate-magic-sparkle"
          style={{ bottom: '28%', right: '18%', width: '12px', height: '12px', ['--sparkle-duration' as any]: '4.8s' }}
        >
          <path d="M10 0 Q10 10 20 10 Q10 10 10 20 Q10 10 0 10 Q10 10 10 0 Z" fill="currentColor" />
        </svg>

        {/* Star Dots */}
        <span className="absolute w-[2px] h-[2px] bg-zinc-200/80 rounded-full top-[14%] left-[48%] animate-pulse" style={{ animationDuration: '4s' }} />
        <span className="absolute w-[2.5px] h-[2.5px] bg-zinc-100/80 rounded-full top-[38%] left-[22%] animate-pulse" style={{ animationDuration: '3.6s' }} />
        <span className="absolute w-[2px] h-[2px] bg-zinc-300/70 rounded-full top-[62%] left-[84%] animate-pulse" style={{ animationDuration: '5s' }} />
        <span className="absolute w-[3px] h-[3px] bg-zinc-200/75 rounded-full top-[85%] left-[34%] animate-pulse" style={{ animationDuration: '4.2s' }} />
      </div>

      {/* Centered Form Container */}
      <div className="w-full max-w-[460px] relative z-10">
        
        <Card className="rounded-2xl border border-zinc-800/90 bg-zinc-900/50 backdrop-blur-xl shadow-2xl text-zinc-100 p-2 sm:p-4">
          
          <CardHeader className="space-y-2 pb-6 pt-6 px-6 text-left">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-[11px] font-medium bg-zinc-800/60 border border-zinc-700/50 text-zinc-300 w-fit">
              <ShieldCheck className="h-3.5 w-3.5 text-zinc-300" />
              <span>Toolbit Management Portal</span>
            </div>

            <div className="pt-2">
              <CardTitle className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                Sign in
              </CardTitle>
              <CardDescription className="text-sm text-zinc-400 font-normal mt-1.5 leading-relaxed">
                Enter your administrator credentials to access the governance console.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="px-6 pb-6">
            <form onSubmit={handleLogin} noValidate className={`space-y-5 text-left transition-opacity duration-200 ${loading ? 'opacity-50 pointer-events-none select-none' : ''}`}>
              
              {/* Error Alert using Shadcn Component */}
              {error && (
                <Alert variant="destructive" className="border-rose-500/20 bg-rose-500/10 text-rose-300 py-3 rounded-xl animate-in fade-in duration-200">
                  <AlertCircle className="h-4 w-4 text-rose-400" />
                  <AlertTitle className="text-xs font-semibold text-rose-200">Authentication Failed</AlertTitle>
                  <AlertDescription className="text-xs font-normal leading-relaxed text-rose-300/90 mt-0.5">
                    {error}
                  </AlertDescription>
                </Alert>
              )}

              {/* Email / Terminal ID Field */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs sm:text-sm font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-zinc-400" />
                  Email Address <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="admin@toolbit.ai"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email) {
                      setFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next.email;
                        return next;
                      });
                    }
                    if (error) setError(null);
                  }}
                  className={`h-11 sm:h-12 px-4 rounded-xl bg-zinc-950/80 text-zinc-100 placeholder:text-zinc-500 text-sm transition-colors shadow-xs outline-none focus:outline-none focus:ring-0 focus-visible:ring-0 ${
                    fieldErrors.email
                      ? 'border-rose-500/80 focus-visible:border-rose-500'
                      : 'border-zinc-800 focus:border-zinc-300 focus-visible:border-zinc-300'
                  }`}
                  autoComplete="email"
                  disabled={loading}
                />
                {fieldErrors.email && (
                  <p className="text-xs font-semibold text-rose-400 mt-1 flex items-center gap-1">
                    <AlertCircle size={13} className="shrink-0" /> {fieldErrors.email}
                  </p>
                )}
              </div>

              {/* Password / Access Key Field */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs sm:text-sm font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-zinc-400" />
                  Password <span className="text-rose-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldErrors.password) {
                        setFieldErrors((prev) => {
                          const next = { ...prev };
                          delete next.password;
                          return next;
                        });
                      }
                      if (error) setError(null);
                    }}
                    className={`h-11 sm:h-12 px-4 pr-11 rounded-xl bg-zinc-950/80 text-zinc-100 placeholder:text-zinc-500 text-sm transition-colors shadow-xs outline-none focus:outline-none focus:ring-0 focus-visible:ring-0 ${
                      fieldErrors.password
                        ? 'border-rose-500/80 focus-visible:border-rose-500'
                        : 'border-zinc-800 focus:border-zinc-300 focus-visible:border-zinc-300'
                    }`}
                    autoComplete="current-password"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition-colors p-1 focus:outline-none cursor-pointer"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p className="text-xs font-semibold text-rose-400 mt-1 flex items-center gap-1">
                    <AlertCircle size={13} className="shrink-0" /> {fieldErrors.password}
                  </p>
                )}
              </div>

              {/* Action Submit Button using Shadcn Component */}
              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 sm:h-12 rounded-xl font-semibold text-sm sm:text-base bg-white text-zinc-950 hover:bg-zinc-200 transition-all duration-200 active:scale-[0.99] cursor-pointer shadow-md"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Spinner size={17} className="text-zinc-950" />
                      Authenticating...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      Sign In to Dashboard
                      <ArrowRight size={16} />
                    </span>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>

          <CardFooter className="px-6 py-4 border-t border-zinc-800/70 text-center flex items-center justify-center">
            <p className="text-xs text-zinc-500 font-medium tracking-wide">
              Authorised Personnel Only • Toolbit Governance
            </p>
          </CardFooter>
        </Card>
      </div>

    </div>
  );
}
