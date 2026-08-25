'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAdmin } from '@/contexts/AdminContext';
import LoadingOverlay from '@/components/common/LoadingOverlay';
import {
  Shield,
  User,
  Mail,
  Camera,
  Key,
  CheckCircle2,
  AlertCircle,
  X,
  Eye,
  EyeOff,
  Lock,
  Save,
  Loader2,
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

export default function ProfilePage() {
  const { refreshAdmin } = useAdmin();
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
    const newErrors: Record<string, string> = {};
    if (!formData.full_name.trim()) newErrors.full_name = 'Name is required';
    if (!formData.email.trim() || !formData.email.includes('@')) newErrors.email = 'Valid email is required';

    if (showPasswordUpdate) {
      if (!formData.password) {
        newErrors.password = 'New password is required';
      } else if (formData.password.length < 6) {
        newErrors.password = 'Minimum 6 characters required';
      }
      if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
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

  if (loading) return <LoadingOverlay message="Fetching secure profile data..." />;

  return (
    <div className="max-w-[1200px] mx-auto p-6 md:p-8 animate-in fade-in duration-500">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <Badge variant="default" className="gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider mb-3">
            <Shield size={12} />
            System Governance
          </Badge>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Account Intelligence</h1>
          <p className="text-sm text-[var(--text-muted)] font-medium mt-1">Manage your administrative identity and security clearance.</p>
        </div>
        {!isEditing && (
          <Button
            onClick={() => setIsEditing(true)}
            size="default"
            className="gap-2 font-bold text-xs uppercase tracking-wider shadow-sm"
          >
            <Edit3 size={14} />
            Modify Profile
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Identity Overview Card */}
        <div className="lg:col-span-4 space-y-8">
          <Card className="relative overflow-hidden group border-[var(--border-color)] bg-[var(--bg-surface)] shadow-sm">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-500" />

            <CardContent className="p-6 flex flex-col items-center text-center">
              <div className="relative mb-5 group/avatar">
                <Avatar className="w-28 h-28 border-2 border-indigo-500/20 shadow-md ring-4 ring-[var(--bg-surface)] transition-transform duration-300 group-hover/avatar:scale-105">
                  <AvatarImage
                    src={isEditing ? formData.avatar_url : profile?.avatar_url}
                    alt={profile?.full_name || 'Admin'}
                  />
                  <AvatarFallback className="text-3xl font-bold">
                    {profile?.full_name?.substring(0, 1).toUpperCase() || 'A'}
                  </AvatarFallback>
                </Avatar>
              </div>

              <div className="space-y-1.5 mb-5">
                <h3 className="text-xl font-bold text-[var(--text-primary)] tracking-tight leading-none">
                  {profile?.full_name || 'Administrator'}
                </h3>
                <Badge variant="default" className="text-[10px] font-bold uppercase tracking-wider">
                  System Administrator
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
          <Card className="border-[var(--border-color)] bg-[var(--bg-surface)] shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-1.5 h-5 bg-indigo-500 rounded-full" />
                <CardTitle className="text-lg">Identity</CardTitle>
              </div>
              {isEditing && (
                <Badge variant="default" className="text-[9px] font-bold uppercase tracking-wider animate-pulse">
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
                          className={`pl-10 ${errors.full_name ? 'border-rose-500 focus-visible:ring-rose-500/20' : ''}`}
                          placeholder="Your full name"
                        />
                      </div>
                      {errors.full_name && <p className="text-[11px] font-semibold text-rose-500 ml-1">{errors.full_name}</p>}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider ml-1">
                        Terminal Email <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" size={14} />
                        <Input
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
                          className={`pl-10 ${errors.email ? 'border-rose-500 focus-visible:ring-rose-500/20' : ''}`}
                          placeholder="admin@toolbit.ai"
                        />
                      </div>
                      {errors.email && <p className="text-[11px] font-semibold text-rose-500 ml-1">{errors.email}</p>}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  <DossierItem label="Official Name" value={profile?.full_name} icon={<User size={14} />} />
                  <DossierItem label="Secure Email" value={profile?.email} icon={<Mail size={14} />} />
                  <DossierItem label="Clearance" value="Super Admin" icon={<Shield size={14} />} isBadge badgeVariant="default" />
                  <DossierItem label="Identity Status" value="Verified & Active" icon={<CheckCircle2 size={14} />} isBadge badgeVariant="success" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Security Card */}
          <Card className="border-[var(--border-color)] bg-[var(--bg-surface)] shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-1.5 h-5 rounded-full bg-indigo-500" />
                <CardTitle className="text-lg">Security</CardTitle>
              </div>

              {isEditing && !showPasswordUpdate && (
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => setShowPasswordUpdate(true)}
                  className="gap-1.5 text-[10px] font-bold uppercase tracking-wider"
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
                          className={`pl-10 pr-10 ${errors.password ? 'border-rose-500 focus-visible:ring-rose-500/20' : ''}`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPasswordText(!showPasswordText)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-indigo-500 transition-colors p-1 cursor-pointer"
                          tabIndex={-1}
                          title={showPasswordText ? 'Hide password' : 'Show password'}
                        >
                          {showPasswordText ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                      {errors.password && <p className="text-[11px] font-semibold text-rose-500 ml-1">{errors.password}</p>}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider ml-1">
                        Confirm Password <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" size={14} />
                        <Input
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
                          className={`pl-10 pr-10 ${errors.confirmPassword ? 'border-rose-500 focus-visible:ring-rose-500/20' : ''}`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPasswordText(!showConfirmPasswordText)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-indigo-500 transition-colors p-1 cursor-pointer"
                          tabIndex={-1}
                          title={showConfirmPasswordText ? 'Hide password' : 'Show password'}
                        >
                          {showConfirmPasswordText ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                      {errors.confirmPassword && <p className="text-[11px] font-semibold text-rose-500 ml-1">{errors.confirmPassword}</p>}
                    </div>
                  </div>

                  <Alert variant="info" className="border-indigo-500/20 bg-indigo-500/5 text-indigo-500 dark:border-indigo-500/30">
                    <AlertCircle className="h-4 w-4 text-indigo-500" />
                    <AlertDescription className="text-xs text-[var(--text-secondary)] font-medium">
                      Updating your terminal key will require re-authentication on all secondary active sessions.
                    </AlertDescription>
                  </Alert>
                </div>
              ) : (
                <div className="flex items-center gap-4 p-4 rounded-xl bg-[var(--bg-elevated)]/50 border border-[var(--border-color)] border-dashed">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 shrink-0">
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
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="gap-2 min-w-[130px]"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
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

      {saving && <LoadingOverlay message="Updating system credentials..." />}
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
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info';
}) {
  return (
    <div className="space-y-1.5 group">
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider group-hover:text-indigo-500 transition-colors">
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

