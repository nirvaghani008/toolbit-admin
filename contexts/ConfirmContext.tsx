'use client';

import React, { createContext, useContext, useState, useRef } from 'react';
import DeleteConfirmModal from '@/components/common/DeleteConfirmModal';

interface ConfirmOptions {
  title?: string;
  message?: string;
  itemName?: string;
  confirmText?: string;
  cancelText?: string;
}

type ConfirmFunction = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFunction | null>(null);

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    itemName?: string;
    confirmText: string;
    cancelText: string;
  }>({
    isOpen: false,
    title: 'Confirm Delete',
    message: 'Are you sure you want to delete this item? This action cannot be undone.',
    itemName: undefined,
    confirmText: 'Delete',
    cancelText: 'Cancel'
  });

  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirmDelete = (options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setModalState({
        isOpen: true,
        title: options.title || 'Confirm Delete',
        message: options.message || 'Are you sure you want to delete this item? This action cannot be undone.',
        itemName: options.itemName,
        confirmText: options.confirmText || 'Delete',
        cancelText: options.cancelText || 'Cancel'
      });
      resolverRef.current = resolve;
    });
  };

  const handleConfirm = () => {
    if (resolverRef.current) {
      resolverRef.current(true);
    }
    setModalState((prev) => ({ ...prev, isOpen: false, itemName: undefined }));
  };

  const handleCancel = () => {
    if (resolverRef.current) {
      resolverRef.current(false);
    }
    setModalState((prev) => ({ ...prev, isOpen: false, itemName: undefined }));
  };

  return (
    <ConfirmContext.Provider value={confirmDelete}>
      {children}
      <DeleteConfirmModal
        isOpen={modalState.isOpen}
        title={modalState.title}
        message={modalState.message}
        itemName={modalState.itemName}
        confirmText={modalState.confirmText}
        cancelText={modalState.cancelText}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </ConfirmContext.Provider>
  );
}
