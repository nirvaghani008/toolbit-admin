'use client';

import React, { useState, useEffect } from 'react';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { useAdmin } from '@/contexts/AdminContext';
import { scrollToError } from '@/lib/form-utils';
import { Spinner } from '@/components/ui/spinner';
import {
  Shield,
  User,
  Mail,
  CalendarDays,
  Camera,
  Key,
  CheckCircle2,
  AlertCircle,
  X,
  Eye,
  EyeOff,
  Lock,
  Save,
  Edit3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from '@/components/ui/alert';
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from '@/components/ui/avatar';

const profileSchema = z.object({
  full_name: z.string().trim().min(1, 'Name is required'),
  email: z.string().trim().min(1, 'Email is required').email('Valid email is required'),
  avatar_url: z.string().trim().url('Invalid URL format').or(z.literal('')).optional(),
  bio: z.string().optional(),
  password: z.string().optional(),
  confirmPassword: z.string().optional(),
  showPasswordUpdate: z.boolean(),
}).superRefine((data, ctx) => {
  if (data.showPasswordUpdate) {
    if (!data.password || data.password.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'New password is required',
        path: ['password'],
      });
    } else if (data.password.length < 6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Minimum 6 characters required',
        path: ['password'],
      });
    }

    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Passwords do not match',
        path: ['confirmPassword'],
      });
    }
  }
});

export default function ProfilePage() {
  const { refreshAdmin, role } = useAdmin();
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [showPasswordUpdate, setShowPasswordUpdate] = useState(false);
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [showConfirmPasswordText, setShowConfirmPasswordText] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    avatar_url: '',
    bio: '',
    password: '',
    confirmPassword: '',
  });

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const fullName = (user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || user.email?.split('@')[0] || 'Admin';
      const email = user.email || (user.user_metadata?.email as string) || '';
      const avatarUrl = (user.user_metadata?.avatar_url as string) || (user.user_metadata?.picture as string) || '';
      const bio = (user.user_metadata?.bio as string) || '';

      const userProfile = {
        id: user.id,
        created_at: user.created_at,
        full_name: fullName,
        email: email,
        avatar_url: avatarUrl,
        bio: bio,
      };

      setProfile(userProfile);
      setFormData({
        full_name: fullName,
        email: email,
        avatar_url: avatarUrl,
        bio: bio,
        password: '',
        confirmPassword: '',
      });
    } catch (err: any) {
      console.warn('Error fetching profile:', err?.message || err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const validate = () => {
    const result = profileSchema.safeParse({
      ...formData,
      showPasswordUpdate,
    });

    const newErrors: Record<string, string> = {};

    if (!result.success) {
      result.error.issues.forEach((issue) => {
        const fieldName = issue.path[0] as string;
        newErrors[fieldName] = issue.message;
      });
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      scrollToError(newErrors);
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Update Supabase Auth user metadata & email/password
      const authUpdate: any = {
        data: {
          full_name: formData.full_name,
          avatar_url: formData.avatar_url,
          bio: formData.bio,
        },
      };

      if (formData.email && formData.email !== user.email) {
        authUpdate.email = formData.email;
      }
      if (showPasswordUpdate && formData.password) {
        authUpdate.password = formData.password;
      }

      const { error: authErr } = await supabase.auth.updateUser(authUpdate);
      if (authErr) throw authErr;

      // Refresh admin context state so topbar and sidebar immediately reflect the changes
      if (refreshAdmin) {
        await refreshAdmin();
      }

      await fetchProfile();
      setIsEditing(false);
      setShowPasswordUpdate(false);
    } catch (err: any) {
      console.error('Save error:', err);
      setErrors({ global: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Spinner size={28} />
    </div>
  );

  return (
    <div className="max-w-[1200px] mx-auto p-6 md:p-8 animate-in fade-in duration-500">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <div className="flex items-center gap-2.5 mb-2">
            <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">My Profile</h1>
          </div>
          <p className="text-sm text-[var(--text-muted)] font-medium">Manage your administrative identity and security clearance.</p>
        </div>
        {!isEditing && (
          <Button
            onClick={() => setIsEditing(true)}
            size="default"
            className="gap-2 font-bold text-xs bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 rounded-xl shadow-xs active:scale-95 cursor-pointer"
          >
            <Edit3 size={14} />
            Update Profile
          </Button>
        )}
      </div>

      <div className={`grid grid-cols-1 lg:grid-cols-12 gap-8 transition-opacity duration-200 ${saving ? 'opacity-50 pointer-events-none select-none' : ''}`}>
        {/* Left Column: Identity Overview Card */}
        <div className="lg:col-span-4 space-y-8">
          <Card className="relative overflow-hidden group border-[var(--border-color)] bg-[var(--bg-surface)] shadow-sm rounded-3xl">
            <CardContent className="p-6 flex flex-col items-center text-center">
              <div className="relative mb-5 group/avatar">
                <Avatar className="w-28 h-28 border-2 border-zinc-200 dark:border-zinc-700 shadow-sm ring-4 ring-[var(--bg-surface)] transition-transform duration-300 group-hover/avatar:scale-105">
                  <AvatarImage
                    src={isEditing ? formData.avatar_url : profile?.avatar_url}
                    alt={profile?.full_name || 'Admin'}
                  />
                  <AvatarFallback className="text-3xl font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100">
                    {profile?.full_name?.substring(0, 1).toUpperCase() || 'A'}
                  </AvatarFallback>
                </Avatar>
              </div>

              <div className="space-y-1.5 mb-5">
                <h3 className="text-xl font-bold text-[var(--text-primary)] tracking-tight leading-none">
                  {profile?.full_name || 'Administrator'}
                </h3>
                <Badge variant="default" className="text-[10px] font-bold uppercase tracking-wider">
                  {role === 'admin' ? 'admin' : 'sub admin'}
                </Badge>
              </div>

              {isEditing && (
                <div className="w-full space-y-1.5 animate-in slide-in-from-top-2 duration-300 text-left">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block ml-1">
                    Avatar URL
                  </label>
                  <div className="relative">
                    <Camera className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" size={14} />
                    <Input
                      type="text"
                      value={formData.avatar_url}
                      onChange={(e) => setFormData({ ...formData, avatar_url: e.target.value })}
                      placeholder="https://..."
                      className="pl-10 text-xs h-9"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Identity & Security */}
        <div className="lg:col-span-8 space-y-8">
          {/* Identity Card */}
          <Card className="border-[var(--border-color)] bg-[var(--bg-surface)] shadow-sm rounded-3xl">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-1.5 h-5 bg-zinc-900 dark:bg-zinc-100 rounded-full" />
                <CardTitle className="text-lg">Identity</CardTitle>
              </div>
              {isEditing && (
                <Badge variant="slate" className="text-[9px] font-bold uppercase tracking-wider animate-pulse">
                  Protocol Active
                </Badge>
              )}
            </CardHeader>

            <CardContent className="space-y-6 pt-0">
              {isEditing && Object.keys(errors).length > 0 && (
                <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Validation Alert</AlertTitle>
                  <AlertDescription>
                    {errors.global ? (
                      <span>{errors.global}</span>
                    ) : (
                      <span>
                        There are {Object.keys(errors).filter(k => k !== 'global').length} fields that require attention:{' '}
                        <span className="font-bold uppercase tracking-tight">
                          {Object.keys(errors).filter(k => k !== 'global').map(key => key.replace(/_/g, ' ')).join(', ')}
                        </span>
                      </span>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {isEditing ? (
                <div className="space-y-5 animate-in fade-in duration-300">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider ml-1">
                        Full Name <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" size={14} />
                        <Input
                          name="full_name"
                          type="text"
                          value={formData.full_name}
                          onChange={(e) => {
                            setFormData({ ...formData, full_name: e.target.value });
                            if (errors.full_name) {
                              setErrors((prev) => {
                                const next = { ...prev };
                                delete next.full_name;
                                return next;
                              });
                            }
                          }}
                          className={`pl-10 ${errors.full_name ? 'saas-input-error' : ''}`}
                          placeholder="Your full name"
                        />
                      </div>
                      {errors.full_name && <p className="saas-error-message">{errors.full_name}</p>}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider ml-1">
                        Terminal Email <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" size={14} />
                        <Input
                          name="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => {
                            setFormData({ ...formData, email: e.target.value });
                            if (errors.email) {
                              setErrors((prev) => {
                                const next = { ...prev };
                                delete next.email;
                                return next;
                              });
                            }
                          }}
                          className={`pl-10 ${errors.email ? 'saas-input-error' : ''}`}
                          placeholder="admin@toolbit.ai"
                        />
                      </div>
                      {errors.email && <p className="saas-error-message">{errors.email}</p>}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  <DossierItem label="Official Name" value={profile?.full_name} icon={<User size={14} />} />
                  <DossierItem label="Secure Email" value={profile?.email} icon={<Mail size={14} />} />
                  <DossierItem label="Clearance" value={role === 'admin' ? 'admin' : 'sub admin'} icon={<Shield size={14} />} isBadge badgeVariant="default" />
                  <DossierItem
                    label="Joined On"
                    value={profile?.created_at ? new Date(profile.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : null}
                    icon={<CalendarDays size={14} />}
                  />
                  <DossierItem label="Identity Status" value="Verified & Active" icon={<CheckCircle2 size={14} />} isBadge badgeVariant="success" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Security Card */}
          <Card className="border-[var(--border-color)] bg-[var(--bg-surface)] shadow-sm rounded-3xl">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-1.5 h-5 rounded-full bg-zinc-900 dark:bg-zinc-100" />
                <CardTitle className="text-lg">Security</CardTitle>
              </div>

              {isEditing && !showPasswordUpdate && (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setShowPasswordUpdate(true)}
                  className="gap-1.5 text-[10px] font-bold uppercase tracking-wider border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100"
                >
                  <Key size={12} />
                  Rotate Keys
                </Button>
              )}
              {isEditing && showPasswordUpdate && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowPasswordUpdate(false);
                    setFormData((prev) => ({ ...prev, password: '', confirmPassword: '' }));
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.password;
                      delete next.confirmPassword;
                      return next;
                    });
                  }}
                  className="h-8 w-8 text-[var(--text-muted)] hover:text-rose-500"
                  title="Cancel password update"
                >
                  <X size={16} />
                </Button>
              )}
            </CardHeader>

            <CardContent className="space-y-6 pt-0">
              {showPasswordUpdate ? (
                <div className="space-y-5 animate-in fade-in duration-300">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider ml-1">
                        New Password <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" size={14} />
                        <Input
                          name="password"
                          type={showPasswordText ? 'text' : 'password'}
                          value={formData.password}
                          onChange={(e) => {
                            setFormData({ ...formData, password: e.target.value });
                            if (errors.password) {
                              setErrors((prev) => {
                                const next = { ...prev };
                                delete next.password;
                                return next;
                              });
                            }
                          }}
                          placeholder="••••••••••••"
                          className={`pl-10 pr-10 ${errors.password ? 'saas-input-error' : ''}`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPasswordText(!showPasswordText)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-zinc-900 dark:hover:text-white transition-colors p-1 cursor-pointer"
                          tabIndex={-1}
                          title={showPasswordText ? 'Hide password' : 'Show password'}
                        >
                          {showPasswordText ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                      {errors.password && <p className="saas-error-message">{errors.password}</p>}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider ml-1">
                        Confirm Password <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" size={14} />
                        <Input
                          name="confirmPassword"
                          type={showConfirmPasswordText ? 'text' : 'password'}
                          value={formData.confirmPassword}
                          onChange={(e) => {
                            setFormData({ ...formData, confirmPassword: e.target.value });
                            if (errors.confirmPassword) {
                              setErrors((prev) => {
                                const next = { ...prev };
                                delete next.confirmPassword;
                                return next;
                              });
                            }
                          }}
                          placeholder="••••••••••••"
                          className={`pl-10 pr-10 ${errors.confirmPassword ? 'saas-input-error' : ''}`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPasswordText(!showConfirmPasswordText)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-zinc-900 dark:hover:text-white transition-colors p-1 cursor-pointer"
                          tabIndex={-1}
                          title={showConfirmPasswordText ? 'Hide password' : 'Show password'}
                        >
                          {showConfirmPasswordText ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                      {errors.confirmPassword && <p className="saas-error-message">{errors.confirmPassword}</p>}
                    </div>
                  </div>

                  <Alert variant="info" className="border-zinc-200 bg-zinc-50 dark:bg-zinc-800/40 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300">
                    <AlertCircle className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
                    <AlertDescription className="text-xs text-[var(--text-secondary)] font-medium">
                      Updating your terminal key will require re-authentication on all secondary active sessions.
                    </AlertDescription>
                  </Alert>
                </div>
              ) : (
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-[var(--bg-elevated)]/50 border border-[var(--border-color)] border-dashed">
                  <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-700 dark:text-zinc-300 shrink-0 shadow-2xs">
                    <Key size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-[var(--text-primary)] tracking-tight">Identity Key Rotation</div>
                    <div className="text-[11px] text-[var(--text-muted)] font-medium mt-0.5">Last rotated: Highly Secure Session</div>
                  </div>
                  {!isEditing && (
                    <Badge variant="secondary" className="text-[9px] gap-1 opacity-70">
                      <Lock size={10} /> Locked
                    </Badge>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action Footer */}
          {isEditing && (
            <div className="flex items-center justify-end gap-3 pt-2 animate-in fade-in duration-500">
              {errors.global && (
                <div className="mr-auto flex items-center gap-2 text-rose-500">
                  <AlertCircle size={15} />
                  <span className="text-xs font-bold">{errors.global}</span>
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsEditing(false);
                  setShowPasswordUpdate(false);
                  setFormData({
                    full_name: profile?.full_name || '',
                    email: profile?.email || '',
                    avatar_url: profile?.avatar_url || '',
                    bio: profile?.bio || '',
                    password: '',
                    confirmPassword: '',
                  });
                  setErrors({});
                }}
                disabled={saving}
                className="h-11 px-5 font-semibold border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="h-11 px-6 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 font-bold shadow-xs gap-2 min-w-[140px] rounded-xl active:scale-95 cursor-pointer"
              >
                {saving ? (
                  <>
                    <Spinner size={16} className="text-current shrink-0" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Save size={14} />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DossierItem({
  label,
  value,
  icon,
  isBadge,
  badgeVariant = 'default',
}: {
  label: string;
  value?: string | null;
  icon?: React.ReactNode;
  isBadge?: boolean;
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' | 'slate';
}) {
  return (
    <div className="space-y-1.5 group">
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">
        {icon}
        {label}
      </div>
      {isBadge ? (
        <Badge variant={badgeVariant} className="text-[10px] font-bold uppercase tracking-wider">
          {value}
        </Badge>
      ) : (
        <p className="text-sm font-semibold text-[var(--text-primary)] tracking-tight leading-relaxed">
          {value || '—'}
        </p>
      )}
    </div>
  );
}


