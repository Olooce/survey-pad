// #confirm-dialog
export function confirmAction({ title = 'Are you sure?', message, confirmLabel = 'Delete' }) {
  const dialog = document.getElementById('confirm-dialog');
  dialog.querySelector('#confirm-dialog-title').textContent = title;
  dialog.querySelector('#confirm-dialog-message').textContent = message;
  const confirmBtn = dialog.querySelector('#confirm-dialog-confirm');
  confirmBtn.textContent = confirmLabel;

  return new Promise((resolve) => {
    function onConfirm() {
      dialog.returnValue = 'confirm';
      dialog.close('confirm');
    }
    function onClose() {
      confirmBtn.removeEventListener('click', onConfirm);
      dialog.removeEventListener('close', onClose);
      resolve(dialog.returnValue === 'confirm');
    }
    confirmBtn.addEventListener('click', onConfirm);
    dialog.addEventListener('close', onClose);
    dialog.returnValue = 'cancel';
    dialog.showModal();
  });
}
