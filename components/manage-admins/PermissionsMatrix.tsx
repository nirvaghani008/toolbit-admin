'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Save,
  RotateCcw,
  Eye,
  PlusCircle,
  Edit3,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Layers,
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
      const userModPerm = user.permissions?.[mod.key];
      if (userModPerm !== undefined) {
        basePerms[mod.key] = {
          can_view: !!userModPerm?.can_view,
          can_insert: !!userModPerm?.can_insert && mod.supportsInsert,
          can_update: !!userModPerm?.can_update && mod.supportsUpdate,
          can_delete: !!userModPerm?.can_delete && mod.supportsDelete,
        };
      } else if (user.role === 'admin') {
        // Default unconfigured admins to full access
        basePerms[mod.key] = {
          can_view: true,
          can_insert: mod.supportsInsert,
          can_update: mod.supportsUpdate,
          can_delete: mod.supportsDelete,
        };
      } else {
        // Default unconfigured sub-admins to no access
        basePerms[mod.key] = {
          can_view: false,
          can_insert: false,
          can_update: false,
          can_delete: false,
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
      <div className="h-full min-h-[500px] flex flex-col items-center justify-center p-8 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-3xl text-center space-y-4 shadow-xs">
        <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 flex items-center justify-center shadow-2xs">
          <Layers size={24} />
        </div>
        <div className="max-w-md space-y-1">
          <h3 className="text-base font-bold text-[var(--text-primary)] tracking-tight">
            Select a Team Member
          </h3>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            Choose an Admin or Sub-Admin from the list on the left to configure and grant page-by-page (View, Insert, Update, Delete) permissions.
          </p>
        </div>
      </div>
    );
  }

  const isSuperAdmin = user.role === 'admin';

  // Check if permissions were modified
  const isDirty = JSON.stringify(permissions) !== JSON.stringify(initialPermissions);

  // Toggle single action on a module
  const handleToggle = (
    moduleKey: string,
    action: 'can_view' | 'can_insert' | 'can_update' | 'can_delete'
  ) => {
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

  // Bulk column toggles
  const handleToggleColumn = (action: 'can_view' | 'can_insert' | 'can_update' | 'can_delete') => {
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
    if (isSaving) return;

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
        // Fallback to direct update on admin_roles table if RPC is not used or legacy
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
      <div className="p-5 md:p-6 border-b border-[var(--border-color)] bg-[var(--bg-elevated)] flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="shrink-0 w-11 h-11 rounded-xl border border-zinc-200 dark:border-zinc-700 p-0.5 overflow-hidden bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shadow-2xs">
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt=""
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              <div
                className={`w-full h-full rounded-lg flex items-center justify-center text-xs font-bold ${
                  isSuperAdmin
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200'
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
              <Badge
                variant={isSuperAdmin ? 'default' : 'slate'}
                className="text-[8px] font-bold tracking-wider px-1.5 py-0.2 shrink-0 uppercase"
              >
                {isSuperAdmin ? 'Admin' : 'Sub-Admin'}
              </Badge>
            </div>
            <p className="text-xs text-[var(--text-muted)] font-medium mt-0.5">{user.email}</p>
          </div>
        </div>

        {/* Status / Joined date */}
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span className="font-semibold">Member since:</span>
          <Badge variant="outline" className="text-[11px] font-bold">
            {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
          </Badge>
        </div>
      </div>

      {/* Notifications Banner (if any) */}
      {errorMessage && (
        <div className="p-3.5 px-6 bg-rose-50 dark:bg-rose-500/10 border-b border-rose-200 dark:border-rose-500/20 flex items-start gap-3 animate-in fade-in duration-200 shrink-0">
          <AlertCircle className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" size={16} />
          <p className="text-xs font-semibold text-rose-700 dark:text-rose-400 leading-relaxed">
            {errorMessage}
          </p>
        </div>
      )}

      {saveSuccess && (
        <div className="p-3.5 px-6 bg-emerald-50 dark:bg-emerald-500/10 border-b border-emerald-200 dark:border-emerald-500/20 flex items-center gap-3 animate-in fade-in duration-200 shrink-0">
          <CheckCircle2 className="text-emerald-600 dark:text-emerald-400 shrink-0" size={16} />
          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
            Permissions successfully saved and synchronized!
          </p>
        </div>
      )}

      {/* Minimal & Modern Permissions Table with Solid Sticky Header */}
      <div className="flex-1 overflow-y-auto relative">
        <table className="w-full text-left border-collapse">
          {/* Sticky Table Header */}
          <thead className="sticky top-0 z-20 shadow-xs">
            <tr className="border-b border-[var(--border-color)] text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <th className="py-3.5 px-5 bg-[#f6f5f2] dark:bg-zinc-950 min-w-[240px]">
                Section / Page Module
              </th>
              <th className="py-3.5 px-3 bg-[#f6f5f2] dark:bg-zinc-950 text-center w-[100px]">
                <button
                  type="button"
                  onClick={() => handleToggleColumn('can_view')}
                  className="inline-flex items-center gap-1.5 hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                  title="Toggle View for all modules"
                >
                  <Eye size={13} className="text-zinc-500" />
                  <span>View</span>
                </button>
              </th>
              <th className="py-3.5 px-3 bg-[#f6f5f2] dark:bg-zinc-950 text-center w-[100px]">
                <button
                  type="button"
                  onClick={() => handleToggleColumn('can_insert')}
                  className="inline-flex items-center gap-1.5 hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                  title="Toggle Insert for all modules"
                >
                  <PlusCircle size={13} className="text-zinc-500" />
                  <span>Insert</span>
                </button>
              </th>
              <th className="py-3.5 px-3 bg-[#f6f5f2] dark:bg-zinc-950 text-center w-[100px]">
                <button
                  type="button"
                  onClick={() => handleToggleColumn('can_update')}
                  className="inline-flex items-center gap-1.5 hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                  title="Toggle Update for all modules"
                >
                  <Edit3 size={13} className="text-zinc-500" />
                  <span>Update</span>
                </button>
              </th>
              <th className="py-3.5 px-3 bg-[#f6f5f2] dark:bg-zinc-950 text-center w-[100px]">
                <button
                  type="button"
                  onClick={() => handleToggleColumn('can_delete')}
                  className="inline-flex items-center gap-1.5 hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                  title="Toggle Delete for all modules"
                >
                  <Trash2 size={13} className="text-zinc-500" />
                  <span>Delete</span>
                </button>
              </th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-[var(--border-color)]">
            {ADMIN_MODULES.map((mod) => {
              const perm = permissions[mod.key] || {
                can_view: false,
                can_insert: false,
                can_update: false,
                can_delete: false,
              };
              const isViewEnabled = perm.can_view;

              return (
                <tr
                  key={mod.key}
                  className={`transition-colors duration-150 ${
                    isViewEnabled
                      ? 'hover:bg-zinc-50/80 dark:hover:bg-zinc-800/20'
                      : 'opacity-60 bg-[var(--bg-elevated)]/20'
                  }`}
                >
                  {/* Clean Page Title with Path Chip below */}
                  <td className="py-3 px-5">
                    <div className="space-y-0.5">
                      <div className="text-xs font-semibold text-[var(--text-primary)]">
                        {mod.name}
                      </div>
                      <span className="inline-block text-[9px] font-mono text-[var(--text-muted)] bg-[var(--bg-elevated)] border border-[var(--border-color)] px-1.5 py-0.2 rounded">
                        {mod.badge}
                      </span>
                    </div>
                  </td>

                  {/* Action 1: View */}
                  <td className="py-3 px-3 text-center">
                    <label className="inline-flex items-center justify-center cursor-pointer p-1">
                      <input
                        type="checkbox"
                        checked={perm.can_view}
                        onChange={() => handleToggle(mod.key, 'can_view')}
                        className="w-4 h-4 rounded text-zinc-900 bg-[var(--bg-surface)] border-[var(--border-color)] focus:ring-zinc-900 focus:ring-2 cursor-pointer"
                      />
                    </label>
                  </td>

                  {/* Action 2: Insert */}
                  <td className="py-3 px-3 text-center">
                    {mod.supportsInsert ? (
                      <label className="inline-flex items-center justify-center cursor-pointer p-1">
                        <input
                          type="checkbox"
                          disabled={!isViewEnabled}
                          checked={perm.can_insert}
                          onChange={() => handleToggle(mod.key, 'can_insert')}
                          className="w-4 h-4 rounded text-zinc-900 bg-[var(--bg-surface)] border-[var(--border-color)] focus:ring-zinc-900 focus:ring-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
                        />
                      </label>
                    ) : (
                      <span className="text-[11px] text-[var(--text-muted)] font-mono opacity-40">—</span>
                    )}
                  </td>

                  {/* Action 3: Update */}
                  <td className="py-3 px-3 text-center">
                    {mod.supportsUpdate ? (
                      <label className="inline-flex items-center justify-center cursor-pointer p-1">
                        <input
                          type="checkbox"
                          disabled={!isViewEnabled}
                          checked={perm.can_update}
                          onChange={() => handleToggle(mod.key, 'can_update')}
                          className="w-4 h-4 rounded text-zinc-900 bg-[var(--bg-surface)] border-[var(--border-color)] focus:ring-zinc-900 focus:ring-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
                        />
                      </label>
                    ) : (
                      <span className="text-[11px] text-[var(--text-muted)] font-mono opacity-40">—</span>
                    )}
                  </td>

                  {/* Action 4: Delete */}
                  <td className="py-3 px-3 text-center">
                    {mod.supportsDelete ? (
                      <label className="inline-flex items-center justify-center cursor-pointer p-1">
                        <input
                          type="checkbox"
                          disabled={!isViewEnabled}
                          checked={perm.can_delete}
                          onChange={() => handleToggle(mod.key, 'can_delete')}
                          className="w-4 h-4 rounded text-rose-600 bg-[var(--bg-surface)] border-[var(--border-color)] focus:ring-rose-500 focus:ring-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
                        />
                      </label>
                    ) : (
                      <span className="text-[11px] text-[var(--text-muted)] font-mono opacity-40">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Sticky Bottom Actions Bar */}
      <div className="p-4 px-6 border-t border-[var(--border-color)] bg-[var(--bg-elevated)] flex items-center justify-between gap-4 shrink-0">
        <div>
          {isDirty ? (
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5 animate-in fade-in">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              Unsaved changes detected
            </span>
          ) : (
            <span className="text-xs text-[var(--text-muted)]">All changes synchronized with database.</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!isDirty || isSaving}
            onClick={handleReset}
            className="h-10 px-4 font-semibold gap-1.5 cursor-pointer border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl"
          >
            <RotateCcw size={14} />
            Reset
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!isDirty || isSaving}
            onClick={handleSave}
            className="h-10 px-5 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 font-bold shadow-xs gap-2 cursor-pointer rounded-xl active:scale-95"
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
    </div>
  );
}

