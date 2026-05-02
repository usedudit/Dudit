import sys
import io
path = r'c:\Users\MuriloSTR\Downloads\Dudit\components\erp\appointments\sheets\PaymentSheet.tsx'
with io.open(path, 'r', encoding='utf-8') as f:
    c = f.read()

# Fix imports
c = c.replace(
    "import { ReceiptContent, PaymentMethodCard, SplitPaymentCard, Numpad } from './POSComponents';",
    "import { ReceiptContent, PaymentMethodCard, SplitPaymentCard, Numpad } from '../../orders/POSComponents';\nimport Portal from '@/components/Portal';\nimport BottomSheet from '@/components/BottomSheet';\nimport { useMediaQuery } from '@/components/erp/hooks';"
)

c = c.replace(
    "const PaymentModal = ({",
    "const PaymentSheet = ({"
)

c = c.replace(
    ": PaymentModalProps) => {\n    const { toast } = useToast();",
    ": PaymentModalProps) => {\n    const isMobile = useMediaQuery(\"(max-width: 768px)\");\n    const { toast } = useToast();"
)

c = c.replace(
    "export default PaymentModal;",
    "export default PaymentSheet;"
)

# Replace wrappers
wrapper_orig = '''    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={handleSafeClose}
            />

            {/* Modal */}
            <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="relative w-full max-w-xl h-[85vh] bg-white dark:bg-dark-surface rounded-3xl shadow-2xl overflow-hidden flex flex-col pointer-events-auto"
            >'''

c = c.replace(wrapper_orig, '''    const SheetContent = (
        <div className="flex flex-col h-full bg-white dark:bg-dark-surface relative w-full pointer-events-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-4 md:p-6 border-b border-brand-border dark:border-dark-border">
                <div className="flex items-center gap-3">
                    {view !== 'methods' && paymentStatus !== 'success' && (
                        <button onClick={handleGoBack} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-dark-border/50 text-brand-dark dark:text-dark-heading">
                            <ChevronLeftIcon size={24} />
                        </button>
                    )}
                    <div>
                        <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">{getTitle()}</h2>
                        {customer?.name && paymentStatus !== 'success' && (
                            <p className="text-sm text-brand-inactive-text">{headerSubtitle}: {customer.name}</p>
                        )}
                    </div>
                </div>
                {paymentStatus !== 'success' && (
                    <button onClick={handleSafeClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-dark-border/50 text-brand-inactive-text">
                        <XIcon size={24} />
                    </button>
                )}
            </div>

            {/* Body content based on views... */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden relative custom-scrollbar bg-gray-50 dark:bg-dark-background">''')

end_orig = '''                </AnimatePresence>

            </motion.div>
        </div>
    );
};'''

c = c.replace(end_orig, '''                </AnimatePresence>
            </div>
        </div>
    );

    if (!isOpen) return null;

    if (isMobile) {
        return (
            <BottomSheet isOpen={isOpen} onClose={handleSafeClose}>
                {SheetContent}
            </BottomSheet>
        );
    }

    return (
        <Portal>
            <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" onClick={handleSafeClose} />
            <motion.div
                initial={{ x: '100%', opacity: 0.5 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: '100%', opacity: 0.5 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="fixed inset-y-0 right-0 z-[60] w-full max-w-md flex flex-col bg-white shadow-2xl dark:bg-dark-surface overflow-hidden pointer-events-auto"
            >
                {SheetContent}
            </motion.div>
        </Portal>
    );
};''')

# Delete original header from views since we added it to the wrapper:
header_to_remove = '''            {/* Header */}
            <div className="flex items-center justify-between p-4 md:p-6 border-b border-brand-border dark:border-dark-border shrink-0">
                <div className="flex items-center gap-3">
                    {view !== 'methods' && paymentStatus !== 'success' && (
                        <button onClick={handleGoBack} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-dark-border/50 text-brand-dark dark:text-dark-heading">
                            <ChevronLeftIcon size={24} />
                        </button>
                    )}
                    <div>
                        <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">{getTitle()}</h2>
                        {customer?.name && paymentStatus !== 'success' && (
                            <p className="text-sm text-brand-inactive-text">{headerSubtitle}: {customer.name}</p>
                        )}
                    </div>
                </div>
                {paymentStatus !== 'success' && (
                    <button onClick={handleSafeClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-dark-border/50 text-brand-inactive-text">
                        <XIcon size={24} />
                    </button>
                )}
            </div>'''
c = c.replace(header_to_remove, '')

# Delete the wrapper that was around views (the div for views body):
views_wrapper_to_remove_start = '''            {/* Body content based on views... */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden relative custom-scrollbar bg-gray-50 dark:bg-dark-background">'''
c = c.replace(views_wrapper_to_remove_start, '')

with io.open(path, 'w', encoding='utf-8') as f:
    f.write(c)
