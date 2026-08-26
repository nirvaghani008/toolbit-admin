'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { AlertTriangle } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
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

  if (!user) return null;

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
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className={`max-w-[460px] p-6 rounded-3xl transition-opacity duration-200 ${loading ? 'opacity-50 pointer-events-none select-none' : ''}`} onClose={onClose}>
        <DialogHeader className="text-left space-y-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center shadow-2xs">
            <AlertTriangle size={20} />
          </div>
          <DialogTitle className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
            Remove Sub-Admin
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-[var(--text-muted)] mt-2">
          Are you sure you want to revoke all access and remove{' '}
          <strong className="text-[var(--text-primary)]">{user.full_name || user.email}</strong>?
        </p>

        <div className="p-3.5 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-2xl my-3 text-xs font-semibold text-rose-700 dark:text-rose-400">
          This user will no longer be able to log in to the admin portal or access any administrative resources.
        </div>

        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-2xl mb-3 text-xs font-bold text-rose-700 dark:text-rose-400">
            {error}
          </div>
        )}

        <DialogFooter className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-[var(--border-color)]/60">
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
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="h-11 px-6 bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-xs flex items-center gap-2 rounded-xl active:scale-95 cursor-pointer"
          >
            {loading ? (
              <>
                <Spinner size={16} className="text-current shrink-0" />
                Removing...
              </>
            ) : (
              'Yes, Remove Access'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

