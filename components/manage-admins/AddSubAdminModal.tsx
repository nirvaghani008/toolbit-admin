'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  X,
  UserPlus,
  Shield,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { ADMIN_MODULES, ModulePermission } from './types';

interface AddSubAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type PresetType = 'full' | 'content' | 'moderator' | 'readonly' | 'custom';

export default function AddSubAdminModal({ isOpen, onClose, onSuccess }: AddSubAdminModalProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [preset, setPreset] = useState<PresetType>('content');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const generatePresetPermissions = (type: PresetType): Record<string, ModulePermission> => {
    const perms: Record<string, ModulePermission> = {};

    ADMIN_MODULES.forEach((mod) => {
      if (type === 'full') {
        perms[mod.key] = {
          can_view: true,
          can_insert: mod.supportsInsert,
          can_update: mod.supportsUpdate,
          can_delete: mod.supportsDelete,
        };
      } else if (type === 'readonly') {
        perms[mod.key] = {
          can_view: true,
          can_insert: false,
          can_update: false,
          can_delete: false,
        };
      } else if (type === 'content') {
        const isContent = ['blog_posts', 'models', 'news', 'socials'].includes(mod.key);
        perms[mod.key] = {
          can_view: isContent || mod.key === 'dashboard' || mod.key === 'tools',
          can_insert: isContent && mod.supportsInsert,
          can_update: isContent && mod.supportsUpdate,
          can_delete: isContent && mod.supportsDelete,
        };
      } else if (type === 'moderator') {
        const isMod = ['submissions', 'contacts', 'tools'].includes(mod.key);
        perms[mod.key] = {
          can_view: isMod || mod.key === 'dashboard',
          can_insert: isMod && mod.supportsInsert,
          can_update: isMod && mod.supportsUpdate,
          can_delete: isMod && mod.supportsDelete,
        };
      } else {
        // Custom: view dashboard only initially
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!fullName.trim() || !email.trim() || !password.trim()) {
        throw new Error('Please fill in all required fields.');
      }

      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters.');
      }

      const initialPermissions = generatePresetPermissions(preset);

      // Call create_subadmin_user RPC
      const { data, error: rpcError } = await supabase.rpc('create_subadmin_user', {
        p_email: email.trim().toLowerCase(),
        p_password: password,
        p_full_name: fullName.trim(),
        p_permissions: initialPermissions,
      });

      if (rpcError) {
        // Fallback message if RPC is not yet applied in Supabase migration
        if (rpcError.message.includes('function') || rpcError.message.includes('does not exist')) {
          throw new Error(
            'The database RPC create_subadmin_user has not been applied yet in your Supabase SQL Editor. Please apply the migration file in supabase/migrations/ first.'
          );
        }
        throw new Error(rpcError.message);
      }

      // Success
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create sub-admin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-[540px] bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--border-color)] bg-[var(--bg-elevated)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-[#6366f1] flex items-center justify-center shadow-xs">
              <UserPlus size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">Add New Sub-Admin</h2>
              <p className="text-xs text-[var(--text-muted)] font-medium">Create a restricted team member and grant custom page accesses.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-3 animate-in shake duration-300">
              <AlertCircle className="text-rose-500 shrink-0 mt-0.5" size={16} />
              <p className="text-xs font-semibold text-rose-400 leading-relaxed">{error}</p>
            </div>
          )}

          {/* Full Name */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Full Name</label>
            <Input
              type="text"
              required
              placeholder="e.g. Sarah Jenkins"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="h-11 shadow-xs"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Email Address</label>
            <Input
              type="email"
              required
              placeholder="sarah@toolbit.ai"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 shadow-xs"
            />
          </div>

          {/* Temporary Password */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Temporary Password</label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 pr-11 shadow-xs"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-[10px] text-[var(--text-muted)]">Minimum 6 characters. The user can change this after logging in.</p>
          </div>

          {/* Initial Access Preset */}
          <div className="space-y-2 pt-1">
            <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles size={13} className="text-indigo-500" />
              Initial Permissions Template
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'content', label: 'Content Editor', desc: 'Blogs, Models, News & Socials' },
                { id: 'moderator', label: 'Moderator', desc: 'Submissions, Reports & Contacts' },
                { id: 'readonly', label: 'Read-Only Auditor', desc: 'View all modules only' },
                { id: 'full', label: 'Full Sub-Admin', desc: 'Unrestricted CRUD everywhere' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPreset(p.id as PresetType)}
                  className={`p-3 rounded-2xl border text-left transition-all duration-200 cursor-pointer ${
                    preset === p.id
                      ? 'bg-indigo-500/10 border-indigo-500/40 text-[var(--text-primary)] ring-1 ring-indigo-500/20'
                      : 'bg-[var(--bg-elevated)] border-[var(--border-color)] text-[var(--text-secondary)] hover:border-indigo-500/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">{p.label}</span>
                    {preset === p.id && <CheckCircle2 size={14} className="text-indigo-500" />}
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] mt-1 line-clamp-1">{p.desc}</p>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-[var(--text-muted)] italic">
              You can fine-tune every single page permission on the right panel after adding the sub-admin.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-color)]">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="h-11 px-5 font-bold"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="h-11 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md shadow-indigo-600/20 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Creating Account...
                </>
              ) : (
                <>
                  <UserPlus size={16} />
                  Add Sub-Admin
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
