'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { AdminUser } from './types';

interface DeleteAdminDialogProps {
  user: AdminUser | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function DeleteAdminDialog({
  user,
  isOpen,
  onClose,
  onSuccess,
}: DeleteAdminDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !user) return null;

  const handleDelete = async () => {
    setLoading(true);
    setError(null);

    try {
      if (user.role === 'admin') {
        throw new Error('Super Admins cannot be removed.');
      }

      const { error: rpcError } = await supabase.rpc('delete_subadmin_user', {
        p_target_user_id: user.id,
      });

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to remove sub-admin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-[460px] bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center shadow-xs">
              <AlertTriangle size={24} />
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">Remove Sub-Admin</h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Are you sure you want to revoke all access and remove{' '}
            <strong className="text-[var(--text-primary)]">{user.full_name || user.email}</strong>?
          </p>

          <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl my-4 text-xs font-semibold text-rose-400">
            This user will no longer be able to log in to the admin portal or access any administrative resources.
          </div>

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl mb-4 text-xs font-bold text-rose-400">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 mt-6">
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
              type="button"
              onClick={handleDelete}
              disabled={loading}
              className="h-11 px-6 bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-md shadow-rose-600/20 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Removing...
                </>
              ) : (
                'Yes, Remove Access'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
