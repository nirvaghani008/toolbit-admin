'use client';

import React, { useState } from 'react';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { scrollToError } from '@/lib/form-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  UserPlus,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { ADMIN_MODULES, ModulePermission } from './types';

interface AddSubAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const addSubAdminSchema = z.object({
  fullName: z.string().trim().min(1, 'Full name is required'),
  email: z.string().trim().min(1, 'Email address is required').email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required').min(6, 'Password must be at least 6 characters'),
  role: z.enum(['admin', 'subadmin']),
});

export default function AddSubAdminModal({ isOpen, onClose, onSuccess }: AddSubAdminModalProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<'admin' | 'subadmin'>('subadmin');
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  const generateInitialPermissions = (selectedRole: 'admin' | 'subadmin'): Record<string, ModulePermission> => {
    const perms: Record<string, ModulePermission> = {};

    ADMIN_MODULES.forEach((mod) => {
      if (selectedRole === 'admin') {
        perms[mod.key] = {
          can_view: true,
          can_insert: mod.supportsInsert,
          can_update: mod.supportsUpdate,
          can_delete: mod.supportsDelete,
        };
      } else {
        // Sub-admin starts with view access to dashboard only, custom access configured afterwards
        perms[mod.key] = {
          can_view: mod.key === 'dashboard',
          can_insert: false,
          can_update: false,
          can_delete: false,
        };
      }
    });

    return perms;
  };

  const validate = () => {
    const result = addSubAdminSchema.safeParse({
      fullName,
      email,
      password,
      role,
    });

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);

    if (!validate()) {
      return;
    }

    setLoading(true);

    try {
      const initialPermissions = generateInitialPermissions(role);

      // Call create_subadmin_user RPC with role
      const { error: rpcError } = await supabase.rpc('create_subadmin_user', {
        p_email: email.trim().toLowerCase(),
        p_password: password,
        p_full_name: fullName.trim(),
        p_permissions: initialPermissions,
        p_role: role,
      });

      if (rpcError) {
        // Fallback for RPCs that only accept 4 parameters
        if (rpcError.message.includes('parameters') || rpcError.message.includes('parameter count')) {
          const { error: legacyRpcError } = await supabase.rpc('create_subadmin_user', {
            p_email: email.trim().toLowerCase(),
            p_password: password,
            p_full_name: fullName.trim(),
            p_permissions: initialPermissions,
          });
          if (legacyRpcError) throw legacyRpcError;
        } else if (rpcError.message.includes('function') || rpcError.message.includes('does not exist')) {
          throw new Error(
            'The database RPC create_subadmin_user has not been applied yet in your Supabase SQL Editor. Please apply the migration file in supabase/migrations/ first.'
          );
        } else {
          throw new Error(rpcError.message);
        }
      }

      // Reset form
      setFullName('');
      setEmail('');
      setPassword('');
      setRole('subadmin');
      setFieldErrors({});

      // Success
      onSuccess();
      onClose();
    } catch (err: any) {
      setApiError(err?.message || 'Failed to create administrator account.');
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (field: string, val: string) => {
    if (field === 'fullName') setFullName(val);
    if (field === 'email') setEmail(val);
    if (field === 'password') setPassword(val);
    if (field === 'role') setRole(val as 'admin' | 'subadmin');

    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
    if (apiError) setApiError(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[500px] p-0 rounded-3xl overflow-hidden" onClose={onClose}>
        {/* Header */}
        <DialogHeader className="p-6 border-b border-[var(--border-color)] bg-[var(--bg-elevated)] text-left">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 flex items-center justify-center shadow-2xs">
              <UserPlus size={18} />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
                Add Team Member
              </DialogTitle>
              <p className="text-xs text-[var(--text-muted)] font-medium mt-0.5">
                Create a new administrator and assign platform role.
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Form Body */}
        <form onSubmit={handleSubmit} noValidate className="p-6 space-y-4">
          {apiError && (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-2xl flex items-start gap-3 animate-in shake duration-300">
              <AlertCircle className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" size={16} />
              <p className="text-xs font-semibold text-rose-700 dark:text-rose-400 leading-relaxed">{apiError}</p>
            </div>
          )}

          {/* Full Name */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
              Full Name <span className="text-rose-500">*</span>
            </label>
            <Input
              name="fullName"
              type="text"
              placeholder="e.g. Sarah Jenkins"
              value={fullName}
              onChange={(e) => handleFieldChange('fullName', e.target.value)}
              className={`h-11 text-sm shadow-xs ${
                fieldErrors.fullName ? 'border-rose-500 focus-visible:ring-rose-500/20' : ''
              }`}
            />
            {fieldErrors.fullName && (
              <p className="text-[10px] font-bold text-rose-500 mt-1 uppercase tracking-wider flex items-center gap-1">
                <AlertCircle size={11} /> {fieldErrors.fullName}
              </p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
              Email Address <span className="text-rose-500">*</span>
            </label>
            <Input
              name="email"
              type="email"
              placeholder="sarah@toolbit.ai"
              value={email}
              onChange={(e) => handleFieldChange('email', e.target.value)}
              className={`h-11 text-sm shadow-xs ${
                fieldErrors.email ? 'border-rose-500 focus-visible:ring-rose-500/20' : ''
              }`}
            />
            {fieldErrors.email && (
              <p className="text-[10px] font-bold text-rose-500 mt-1 uppercase tracking-wider flex items-center gap-1">
                <AlertCircle size={11} /> {fieldErrors.email}
              </p>
            )}
          </div>

          {/* Temporary Password */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
              Temporary Password <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Input
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => handleFieldChange('password', e.target.value)}
                className={`h-11 pr-11 text-sm shadow-xs ${
                  fieldErrors.password ? 'border-rose-500 focus-visible:ring-rose-500/20' : ''
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1 cursor-pointer"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {fieldErrors.password ? (
              <p className="text-[10px] font-bold text-rose-500 mt-1 uppercase tracking-wider flex items-center gap-1">
                <AlertCircle size={11} /> {fieldErrors.password}
              </p>
            ) : (
              <p className="text-[10px] text-[var(--text-muted)]">Minimum 6 characters. The user can change this after signing in.</p>
            )}
          </div>

          {/* Role Selection Dropdown */}
          <div className="space-y-1.5 pt-1">
            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
              Administrator Role
            </label>
            <Select
              name="role"
              value={role}
              onChange={(val) => handleFieldChange('role', val)}
              className="h-11 text-sm shadow-xs"
            >
              <option value="subadmin">Sub-Admin</option>
              <option value="admin">Admin</option>
            </Select>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-color)]">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="h-11 px-5 font-semibold border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="h-11 px-6 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 font-bold shadow-xs flex items-center gap-2 rounded-xl active:scale-95 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Creating Account...
                </>
              ) : (
                <>
                  <UserPlus size={16} />
                  Add Team Member
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

