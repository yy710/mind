import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent } from '../dialog/dialog';
import { useDrawnix } from '../../hooks/use-drawnix';
import { useBoard } from '@plait-board/react-board';
import { getDefaultName } from '../../data/json';
import { saveToServer } from '../../data/upload';
import { useI18n } from '../../i18n';
import './save-dialog.scss';

export const SaveDialog = ({
  container,
}: {
  container: HTMLElement | null;
}) => {
  const { appState, setAppState } = useDrawnix();
  const { t } = useI18n();
  const board = useBoard();
  const [name, setName] = useState<string>(getDefaultName());
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (appState.openSaveDialog) {
      const defaultName = getDefaultName();
      setName(defaultName);
      // focus on next tick
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [appState.openSaveDialog]);

  const close = () => setAppState({ ...appState, openSaveDialog: false });

  const onSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const finalName = (name || '').trim() || getDefaultName();
      await saveToServer(board, finalName);
      close();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={appState.openSaveDialog}
      onOpenChange={(open) => {
        setAppState({ ...appState, openSaveDialog: open });
      }}
    >
      <DialogContent className="save-dialog" container={container}>
        <h2 className="save-dialog__title">{t('saveDialog.title')}</h2>
        <div className="save-dialog__body">
          <input
            ref={inputRef}
            className="save-dialog__input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('saveDialog.placeholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onSubmit();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                close();
              }
            }}
          />
        </div>
        <div className="save-dialog__actions">
          <button
            className="save-dialog__button save-dialog__button--cancel"
            onClick={close}
            disabled={submitting}
          >
            {t('saveDialog.cancel')}
          </button>
          <button
            className="save-dialog__button save-dialog__button--ok"
            onClick={onSubmit}
            disabled={submitting}
            autoFocus
          >
            {t('saveDialog.ok')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SaveDialog;