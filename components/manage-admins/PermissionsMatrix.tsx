'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Shield,
  ShieldCheck,
  Check,
  Save,
  RotateCcw,
  Sparkles,
  Lock,
  Eye,
  PlusCircle,
  Edit3,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Layers,
  FileCheck2,
} from 'lucide-react';
import { AdminUser, ADMIN_MODULES, ModulePermission } from './types';

interface PermissionsMatrixProps {
  user: AdminUser | null;
  onPermissionsUpdated: () => void;
}

export default function PermissionsMatrix({ user, onPermissionsUpdated }: PermissionsMatrixProps) {
  const [permissions, setPermissions] = useState<Record<string, ModulePermission>>({});
  const [initialPermissions, setInitialPermissions] = useState<Record<string, ModulePermission>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize permissions when selected user changes
  useEffect(() => {
    if (!user) return;

    const basePerms: Record<string, ModulePermission> = {};
    ADMIN_MODULES.forEach((mod) => {
      if (user.role === 'admin') {
        basePerms[mod.key] = {
          can_view: true,
          can_insert: mod.supportsInsert,
          can_update: mod.supportsUpdate,
          can_delete: mod.supportsDelete,
        };
      } else {
        const userModPerm = user.permissions?.[mod.key];
        basePerms[mod.key] = {
          can_view: !!userModPerm?.can_view,
          can_insert: !!userModPerm?.can_insert && mod.supportsInsert,
          can_update: !!userModPerm?.can_update && mod.supportsUpdate,
          can_delete: !!userModPerm?.can_delete && mod.supportsDelete,
        };
      }
    });

    setPermissions(basePerms);
    setInitialPermissions(basePerms);
    setSaveSuccess(false);
    setErrorMessage(null);
  }, [user]);

  if (!user) {
    return (
      <div className="h-full min-h-[500px] flex flex-col items-center justify-center p-8 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-3xl text-center space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 text-[#6366f1] flex items-center justify-center shadow-md">
          <Layers size={28} />
        </div>
        <div className="max-w-md space-y-1">
          <h3 className="text-base font-bold text-[var(--text-primary)] tracking-tight">
            Select a Team Member
          </h3>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            Choose an Admin or Sub-Admin from the list on the left to view, configure, and grant granular page-by-page and action-by-action permissions.
          </p>
        </div>
      </div>
    );
  }

  const isSuperAdmin = user.role === 'admin';

  // Check if permissions were modified
  const isDirty =
    !isSuperAdmin &&
    JSON.stringify(permissions) !== JSON.stringify(initialPermissions);

  // Toggle single action on a module
  const handleToggle = (
    moduleKey: string,
    action: 'can_view' | 'can_insert' | 'can_update' | 'can_delete'
  ) => {
    if (isSuperAdmin) return;

    setPermissions((prev) => {
      const current = prev[moduleKey] || {
        can_view: false,
        can_insert: false,
        can_update: false,
        can_delete: false,
      };

      const updated = { ...current };
      const nextVal = !updated[action];
      updated[action] = nextVal;

      // Smart Dependencies:
      // If View is disabled, all sub-actions (insert/update/delete) must be disabled
      if (action === 'can_view' && !nextVal) {
        updated.can_insert = false;
        updated.can_update = false;
        updated.can_delete = false;
      }

      // If any sub-action is enabled, View must be automatically enabled
      if (action !== 'can_view' && nextVal) {
        updated.can_view = true;
      }

      return { ...prev, [moduleKey]: updated };
    });

    setSaveSuccess(false);
  };

  // Apply Presets
  const applyPreset = (type: 'full' | 'content' | 'moderator' | 'readonly' | 'clear') => {
    if (isSuperAdmin) return;

    const newPerms: Record<string, ModulePermission> = {};
    ADMIN_MODULES.forEach((mod) => {
      if (type === 'full') {
        newPerms[mod.key] = {
          can_view: true,
          can_insert: mod.supportsInsert,
          can_update: mod.supportsUpdate,
          can_delete: mod.supportsDelete,
        };
      } else if (type === 'readonly') {
        newPerms[mod.key] = {
          can_view: true,
          can_insert: false,
          can_update: false,
          can_delete: false,
        };
      } else if (type === 'content') {
        const isContent = ['blog_posts', 'models', 'news', 'socials'].includes(mod.key);
        newPerms[mod.key] = {
          can_view: isContent || mod.key === 'dashboard' || mod.key === 'tools',
          can_insert: isContent && mod.supportsInsert,
          can_update: isContent && mod.supportsUpdate,
          can_delete: isContent && mod.supportsDelete,
        };
      } else if (type === 'moderator') {
        const isMod = ['submissions', 'contacts', 'tools'].includes(mod.key);
        newPerms[mod.key] = {
          can_view: isMod || mod.key === 'dashboard',
          can_insert: isMod && mod.supportsInsert,
          can_update: isMod && mod.supportsUpdate,
          can_delete: isMod && mod.supportsDelete,
        };
      } else {
        // Clear / Reset All
        newPerms[mod.key] = {
          can_view: false,
          can_insert: false,
          can_update: false,
          can_delete: false,
        };
      }
    });

    setPermissions(newPerms);
    setSaveSuccess(false);
  };

  // Bulk column toggles
  const handleToggleColumn = (action: 'can_view' | 'can_insert' | 'can_update' | 'can_delete') => {
    if (isSuperAdmin) return;

    const allChecked = ADMIN_MODULES.every((mod) => {
      if (action === 'can_insert' && !mod.supportsInsert) return true;
      if (action === 'can_update' && !mod.supportsUpdate) return true;
      if (action === 'can_delete' && !mod.supportsDelete) return true;
      return !!permissions[mod.key]?.[action];
    });

    const nextState = !allChecked;

    setPermissions((prev) => {
      const next = { ...prev };
      ADMIN_MODULES.forEach((mod) => {
        const curr = next[mod.key] || {
          can_view: false,
          can_insert: false,
          can_update: false,
          can_delete: false,
        };

        if (action === 'can_view') {
          curr.can_view = nextState;
          if (!nextState) {
            curr.can_insert = false;
            curr.can_update = false;
            curr.can_delete = false;
          }
        } else if (action === 'can_insert' && mod.supportsInsert) {
          curr.can_insert = nextState;
          if (nextState) curr.can_view = true;
        } else if (action === 'can_update' && mod.supportsUpdate) {
          curr.can_update = nextState;
          if (nextState) curr.can_view = true;
        } else if (action === 'can_delete' && mod.supportsDelete) {
          curr.can_delete = nextState;
          if (nextState) curr.can_view = true;
        }

        next[mod.key] = curr;
      });
      return next;
    });
    setSaveSuccess(false);
  };

  // Save changes to Supabase
  const handleSave = async () => {
    if (isSuperAdmin || isSaving) return;

    setIsSaving(true);
    setErrorMessage(null);
    setSaveSuccess(false);

    try {
      // 1. Try RPC save_subadmin_permissions
      const { error: rpcError } = await supabase.rpc('save_subadmin_permissions', {
        p_target_user_id: user.id,
        p_permissions: permissions,
      });

      if (rpcError) {
        // Fallback to direct update on admin_roles table if RPC is not used
        const { error: directError } = await supabase
          .from('admin_roles')
          .update({
            permissions: permissions,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id);

        if (directError) {
          throw new Error(
            rpcError.message || directError.message || 'Failed to save permissions.'
          );
        }
      }

      setInitialPermissions(permissions);
      setSaveSuccess(true);
      onPermissionsUpdated();
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      console.error('Error saving permissions:', err);
      setErrorMessage(
        err?.message ||
          'Failed to update permissions. Please ensure the migration in supabase/migrations/ has been applied.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setPermissions(initialPermissions);
    setErrorMessage(null);
    setSaveSuccess(false);
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-3xl overflow-hidden shadow-xs">
      {/* User Header Summary */}
      <div className="p-6 border-b border-[var(--border-color)] bg-[var(--bg-elevated)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="shrink-0 w-12 h-12 rounded-2xl border border-indigo-500/20 p-0.5 overflow-hidden bg-gradient-to-br from-indigo-500/10 to-purple-500/10 flex items-center justify-center shadow-xs">
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt=""
                className="w-full h-full object-cover rounded-2xl"
              />
            ) : (
              <div
                className={`w-full h-full rounded-[14px] flex items-center justify-center text-sm font-black text-white ${
                  isSuperAdmin
                    ? 'bg-gradient-to-br from-indigo-600 to-purple-600'
                    : 'bg-gradient-to-br from-emerald-600 to-teal-600'
                }`}
              >
                {(user.full_name || user.email || 'A').substring(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">
                {user.full_name || user.email.split('@')[0]}
              </h2>
              <span
                className={`text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-md border uppercase shrink-0 ${
                  isSuperAdmin
                    ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20'
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                }`}
              >
                {isSuperAdmin ? 'Super Admin' : 'Sub-Admin'}
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] font-medium mt-0.5">{user.email}</p>
          </div>
        </div>

        {/* Status / Joined pill */}
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span className="font-semibold">Member since:</span>
          <Badge variant="outline" className="text-[11px] font-bold">
            {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
          </Badge>
        </div>
      </div>

      {/* Super Admin Notice */}
      {isSuperAdmin ? (
        <div className="p-6">
          <div className="p-5 rounded-2xl bg-indigo-500/[0.08] dark:bg-indigo-500/[0.12] border border-indigo-500/30 flex items-start gap-4 shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md">
              <ShieldCheck size={22} />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-[var(--text-primary)]">
                Unrestricted Master Governance
              </h4>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Super Admins possess root-level authorization across the entire platform. They have permanent, full Insert, Update, Delete, and View capabilities for all sections, database operations, and role management.
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* Presets & Tools Bar for Sub-Admin */
        <div className="p-4 px-6 border-b border-[var(--border-color)] bg-[var(--bg-surface)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mr-1 flex items-center gap-1">
              <Sparkles size={12} className="text-indigo-500" />
              Presets:
            </span>
            <button
              onClick={() => applyPreset('full')}
              className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] hover:bg-indigo-500/10 hover:text-indigo-500 hover:border-indigo-500/30 transition-all cursor-pointer"
            >
              Full Access
            </button>
            <button
              onClick={() => applyPreset('content')}
              className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] hover:bg-indigo-500/10 hover:text-indigo-500 hover:border-indigo-500/30 transition-all cursor-pointer"
            >
              Content Editor
            </button>
            <button
              onClick={() => applyPreset('moderator')}
              className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] hover:bg-indigo-500/10 hover:text-indigo-500 hover:border-indigo-500/30 transition-all cursor-pointer"
            >
              Moderator
            </button>
            <button
              onClick={() => applyPreset('readonly')}
              className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] hover:bg-indigo-500/10 hover:text-indigo-500 hover:border-indigo-500/30 transition-all cursor-pointer"
            >
              View Only
            </button>
            <button
              onClick={() => applyPreset('clear')}
              className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-rose-500/20 bg-rose-500/5 text-rose-500 hover:bg-rose-500/10 transition-all cursor-pointer"
            >
              Revoke All
            </button>
          </div>

          <div className="text-[11px] text-[var(--text-muted)] font-medium">
            {Object.values(permissions).filter((p) => p.can_view).length} of{' '}
            {ADMIN_MODULES.length} sections allowed
          </div>
        </div>
      )}

      {/* Granular Matrix Table */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {errorMessage && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-3 mb-5 animate-in fade-in duration-200">
            <AlertCircle className="text-rose-500 shrink-0 mt-0.5" size={16} />
            <p className="text-xs font-semibold text-rose-400 leading-relaxed">{errorMessage}</p>
          </div>
        )}

        {saveSuccess && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-3 mb-5 animate-in fade-in duration-200">
            <CheckCircle2 className="text-emerald-500 shrink-0" size={16} />
            <p className="text-xs font-bold text-emerald-400">
              Permissions successfully updated and synchronized!
            </p>
          </div>
        )}

        <div className="border border-[var(--border-color)] rounded-2xl overflow-hidden shadow-xs bg-[var(--bg-surface)]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-color)] bg-[var(--bg-elevated)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <th className="py-3.5 px-4 min-w-[220px]">Section / Page Module</th>
                <th className="py-3.5 px-3 text-center w-[110px]">
                  <button
                    type="button"
                    disabled={isSuperAdmin}
                    onClick={() => handleToggleColumn('can_view')}
                    className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors cursor-pointer disabled:cursor-default"
                    title="Toggle View for all modules"
                  >
                    <Eye size={13} className="text-indigo-500" />
                    <span>View</span>
                  </button>
                </th>
                <th className="py-3.5 px-3 text-center w-[110px]">
                  <button
                    type="button"
                    disabled={isSuperAdmin}
                    onClick={() => handleToggleColumn('can_insert')}
                    className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors cursor-pointer disabled:cursor-default"
                    title="Toggle Insert for all modules"
                  >
                    <PlusCircle size={13} className="text-emerald-500" />
                    <span>Insert</span>
                  </button>
                </th>
                <th className="py-3.5 px-3 text-center w-[110px]">
                  <button
                    type="button"
                    disabled={isSuperAdmin}
                    onClick={() => handleToggleColumn('can_update')}
                    className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors cursor-pointer disabled:cursor-default"
                    title="Toggle Update for all modules"
                  >
                    <Edit3 size={13} className="text-amber-500" />
                    <span>Update</span>
                  </button>
                </th>
                <th className="py-3.5 px-3 text-center w-[110px]">
                  <button
                    type="button"
                    disabled={isSuperAdmin}
                    onClick={() => handleToggleColumn('can_delete')}
                    className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors cursor-pointer disabled:cursor-default"
                    title="Toggle Delete for all modules"
                  >
                    <Trash2 size={13} className="text-rose-500" />
                    <span>Delete</span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {ADMIN_MODULES.map((mod) => {
                const perm = permissions[mod.key] || {
                  can_view: false,
                  can_insert: false,
                  can_update: false,
                  can_delete: false,
                };
                const isViewEnabled = perm.can_view || isSuperAdmin;

                return (
                  <tr
                    key={mod.key}
                    className={`transition-colors duration-150 ${
                      isViewEnabled
                        ? 'hover:bg-[var(--bg-elevated)]/60'
                        : 'opacity-60 bg-[var(--bg-elevated)]/20'
                    }`}
                  >
                    {/* Module Details */}
                    <td className="py-4 px-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[var(--text-primary)]">
                            {mod.name}
                          </span>
                          <span className="text-[9px] font-mono text-[var(--text-muted)] bg-[var(--bg-elevated)] border border-[var(--border-color)] px-1.5 py-0.5 rounded">
                            {mod.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--text-muted)] leading-tight max-w-[380px]">
                          {mod.description}
                        </p>
                      </div>
                    </td>

                    {/* Action 1: View */}
                    <td className="py-4 px-3 text-center">
                      <label className="inline-flex items-center justify-center cursor-pointer p-1">
                        <input
                          type="checkbox"
                          disabled={isSuperAdmin}
                          checked={isSuperAdmin ? true : perm.can_view}
                          onChange={() => handleToggle(mod.key, 'can_view')}
                          className="w-4 h-4 rounded text-indigo-600 bg-[var(--bg-surface)] border-[var(--border-color)] focus:ring-indigo-500 focus:ring-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-80"
                        />
                      </label>
                    </td>

                    {/* Action 2: Insert */}
                    <td className="py-4 px-3 text-center">
                      {mod.supportsInsert ? (
                        <label className="inline-flex items-center justify-center cursor-pointer p-1">
                          <input
                            type="checkbox"
                            disabled={isSuperAdmin || !isViewEnabled}
                            checked={isSuperAdmin ? true : perm.can_insert}
                            onChange={() => handleToggle(mod.key, 'can_insert')}
                            className="w-4 h-4 rounded text-emerald-600 bg-[var(--bg-surface)] border-[var(--border-color)] focus:ring-emerald-500 focus:ring-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                          />
                        </label>
                      ) : (
                        <span className="text-[11px] text-[var(--text-muted)] font-mono">—</span>
                      )}
                    </td>

                    {/* Action 3: Update */}
                    <td className="py-4 px-3 text-center">
                      {mod.supportsUpdate ? (
                        <label className="inline-flex items-center justify-center cursor-pointer p-1">
                          <input
                            type="checkbox"
                            disabled={isSuperAdmin || !isViewEnabled}
                            checked={isSuperAdmin ? true : perm.can_update}
                            onChange={() => handleToggle(mod.key, 'can_update')}
                            className="w-4 h-4 rounded text-amber-600 bg-[var(--bg-surface)] border-[var(--border-color)] focus:ring-amber-500 focus:ring-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                          />
                        </label>
                      ) : (
                        <span className="text-[11px] text-[var(--text-muted)] font-mono">—</span>
                      )}
                    </td>

                    {/* Action 4: Delete */}
                    <td className="py-4 px-3 text-center">
                      {mod.supportsDelete ? (
                        <label className="inline-flex items-center justify-center cursor-pointer p-1">
                          <input
                            type="checkbox"
                            disabled={isSuperAdmin || !isViewEnabled}
                            checked={isSuperAdmin ? true : perm.can_delete}
                            onChange={() => handleToggle(mod.key, 'can_delete')}
                            className="w-4 h-4 rounded text-rose-600 bg-[var(--bg-surface)] border-[var(--border-color)] focus:ring-rose-500 focus:ring-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                          />
                        </label>
                      ) : (
                        <span className="text-[11px] text-[var(--text-muted)] font-mono">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer Actions (Only for Sub-Admins) */}
      {!isSuperAdmin && (
        <div className="p-4 px-6 border-t border-[var(--border-color)] bg-[var(--bg-elevated)] flex items-center justify-between gap-4">
          <div>
            {isDirty ? (
              <span className="text-xs font-bold text-amber-500 flex items-center gap-1.5 animate-in fade-in">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                Unsaved changes detected
              </span>
            ) : (
              <span className="text-xs text-[var(--text-muted)]">All changes synchronized.</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!isDirty || isSaving}
              onClick={handleReset}
              className="h-10 px-4 font-semibold gap-1.5 cursor-pointer"
            >
              <RotateCcw size={14} />
              Reset
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!isDirty || isSaving}
              onClick={handleSave}
              className="h-10 px-5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md shadow-indigo-600/20 gap-2 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={15} />
                  Save Permissions
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
