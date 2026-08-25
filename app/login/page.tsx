'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  AlertCircle,
  Cpu,
  Layers,
  GitCompare,
  ArrowRight,
  Activity,
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
import { Badge } from '@/components/ui/badge';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

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
    <div className="min-h-screen w-full flex flex-col lg:flex-row select-none">
      
      {/* ═══════════════════════════════════════════════════════════════════════
          LEFT HALF (50%): Toolbit Galaxy Theme + Prominent Logo & Cards Grid
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="relative w-full lg:w-1/2 min-h-[580px] lg:min-h-screen bg-[#0e0e13] text-white flex flex-col justify-center items-center p-6 sm:p-10 lg:p-14 overflow-hidden border-b lg:border-b-0 lg:border-r border-zinc-800/80">
        
        {/* Galaxy Cosmic Layer (Confined to Left Side) */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          
          {/* Low Opacity Cosmic Texture & Mesh Overlays (Charcoal Theme) */}
          <div className="absolute inset-0 opacity-[0.04] bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:24px_24px]" />
          <div className="absolute inset-0 opacity-[0.025] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:48px_48px]" />
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-700/10 via-transparent to-zinc-900/30" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.035),transparent_65%)]" />

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

        {/* Structured Left Content Container */}
        <div className="relative z-10 w-full max-w-[500px] space-y-7 text-left">
          
          {/* Prominent Brand Header */}
          <div className="space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-zinc-900/90 border border-zinc-750 p-2.5 shadow-xl flex items-center justify-center shrink-0">
                <img
                  src="/images/logo.png"
                  alt="Toolbit Logo"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).parentElement!.innerHTML = '🤖';
                  }}
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                    Toolbit.ai
                  </h1>
                  <Badge variant="outline" className="border-zinc-700/80 bg-zinc-900/80 text-zinc-300 text-[10px] uppercase font-mono tracking-wider">
                    Admin
                  </Badge>
                </div>
                <p className="text-xs sm:text-sm text-zinc-400 font-medium mt-0.5">
                  AI Directory &amp; Model Governance Console
                </p>
              </div>
            </div>

            <p className="text-sm text-zinc-400 leading-relaxed font-normal">
              Manage curated AI tools, track foundation model benchmarks, monitor side-by-side comparisons, and handle fast-track submissions.
            </p>
          </div>

          {/* Normal Cards Layout (2x2 Grid) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
            
            {/* Card 1: AI Directory */}
            <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/50 backdrop-blur-md p-4 space-y-2 transition-all hover:border-zinc-700 hover:bg-zinc-900/70 group shadow-lg">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 group-hover:scale-105 transition-transform">
                  <Layers className="h-4 w-4" />
                </div>
                <span className="text-[10px] font-mono text-zinc-500">1,500+ Tools</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-100">AI Tools Catalog</h3>
                <p className="text-[11px] text-zinc-400 leading-snug mt-0.5">
                  50+ categories with tags, pricing models &amp; reviews.
                </p>
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <span className="text-[9px] px-2 py-0.5 rounded-md bg-zinc-950/80 border border-zinc-800 text-zinc-400">Coding</span>
                <span className="text-[9px] px-2 py-0.5 rounded-md bg-zinc-950/80 border border-zinc-800 text-zinc-400">Design</span>
                <span className="text-[9px] px-2 py-0.5 rounded-md bg-zinc-950/80 border border-zinc-800 text-zinc-400">Writing</span>
              </div>
            </div>

            {/* Card 2: Foundation Models Hub */}
            <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/50 backdrop-blur-md p-4 space-y-2 transition-all hover:border-zinc-700 hover:bg-zinc-900/70 group shadow-lg">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
                  <Cpu className="h-4 w-4" />
                </div>
                <span className="text-[10px] font-mono text-emerald-400 font-medium">Live Feed</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-100">Model Benchmarks</h3>
                <p className="text-[11px] text-zinc-400 leading-snug mt-0.5">
                  Real-time releases, context windows &amp; benchmarks.
                </p>
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <span className="text-[9px] px-2 py-0.5 rounded-md bg-zinc-950/80 border border-zinc-800 text-zinc-300 font-mono">GPT-4o</span>
                <span className="text-[9px] px-2 py-0.5 rounded-md bg-zinc-950/80 border border-zinc-800 text-zinc-300 font-mono">Claude</span>
                <span className="text-[9px] px-2 py-0.5 rounded-md bg-zinc-950/80 border border-zinc-800 text-zinc-300 font-mono">Gemini</span>
              </div>
            </div>

            {/* Card 3: Tool Comparisons */}
            <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/50 backdrop-blur-md p-4 space-y-2 transition-all hover:border-zinc-700 hover:bg-zinc-900/70 group shadow-lg">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 group-hover:scale-105 transition-transform">
                  <GitCompare className="h-4 w-4" />
                </div>
                <span className="text-[10px] font-mono text-zinc-500">Side-by-Side</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-100">Tool Comparisons</h3>
                <p className="text-[11px] text-zinc-400 leading-snug mt-0.5">
                  Feature matrix, user ratings &amp; ranking algorithms.
                </p>
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <span className="text-[9px] px-2 py-0.5 rounded-md bg-zinc-950/80 border border-zinc-800 text-sky-300">Feature Matrix</span>
                <span className="text-[9px] px-2 py-0.5 rounded-md bg-zinc-950/80 border border-zinc-800 text-zinc-400">Pricing vs ROI</span>
              </div>
            </div>

            {/* Card 4: Submissions & Governance */}
            <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/50 backdrop-blur-md p-4 space-y-2 transition-all hover:border-zinc-700 hover:bg-zinc-900/70 group shadow-lg">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <span className="text-[10px] font-medium text-amber-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  24h SLA
                </span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-100">Submissions Queue</h3>
                <p className="text-[11px] text-zinc-400 leading-snug mt-0.5">
                  Creator submissions, advertising orders &amp; guest posts.
                </p>
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <span className="text-[9px] px-2 py-0.5 rounded-md bg-zinc-950/80 border border-zinc-800 text-amber-300">Fast-Track</span>
                <span className="text-[9px] px-2 py-0.5 rounded-md bg-zinc-950/80 border border-zinc-800 text-zinc-400">Role Auth</span>
              </div>
            </div>

          </div>

          {/* Bottom System Status Bar */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80 text-xs text-zinc-400">
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
              <span className="font-medium text-zinc-300">All Systems Operational</span>
            </div>
            <span className="font-mono text-[11px] text-zinc-500">v{new Date().getFullYear()} Core</span>
          </div>

        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          RIGHT HALF (50%): Clean Normal Background + Normal Sized Shadcn Form
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="w-full lg:w-1/2 min-h-screen bg-[#09090b] flex items-center justify-center p-6 sm:p-10 lg:p-16 relative">
        
        {/* Subtle background surface vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.015),transparent_70%)] pointer-events-none" />

        {/* Normal-Sized Form Container */}
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
              <form onSubmit={handleLogin} className="space-y-5 text-left">
                
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
                    Email Address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    placeholder="admin@toolbit.ai"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 sm:h-12 px-4 rounded-xl bg-zinc-950/80 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus-visible:border-zinc-400 focus-visible:ring-1 focus-visible:ring-zinc-400 text-sm transition-colors shadow-xs"
                    autoComplete="email"
                    disabled={loading}
                  />
                </div>

                {/* Password / Access Key Field */}
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-xs sm:text-sm font-semibold text-zinc-200 flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-zinc-400" />
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11 sm:h-12 px-4 pr-11 rounded-xl bg-zinc-950/80 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus-visible:border-zinc-400 focus-visible:ring-1 focus-visible:ring-zinc-400 text-sm transition-colors shadow-xs"
                      autoComplete="current-password"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition-colors p-1 focus:outline-none"
                      tabIndex={-1}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
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
                        <Loader2 size={17} className="animate-spin text-zinc-950" />
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

    </div>
  );
}
