function showToast(message, type = 'error') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `px-4 py-3 rounded-lg text-sm font-medium text-white shadow-lg pointer-events-auto transition-all duration-300 transform translate-y-8 opacity-0`;

    if (type === 'error') {
        toast.classList.add('bg-rose-500', 'border', 'border-rose-600');
    } else if (type === 'success') {
        toast.classList.add('bg-emerald-500', 'border', 'border-emerald-600');
    } else {
        toast.classList.add('bg-blue-500', 'border', 'border-blue-600');
    }

    toast.textContent = message;
    container.appendChild(toast);

    // Trigger reflow
    void toast.offsetWidth;

    toast.classList.remove('translate-y-8', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');

    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-8', 'opacity-0');
        setTimeout(() => {
            if (toast.parentNode === container) {
                container.removeChild(toast);
            }
        }, 300);
    }, 4000);
}
