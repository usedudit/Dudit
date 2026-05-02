import io
import re

path = r'c:\Users\MuriloSTR\Downloads\Dudit\components\erp\appointments\sheets\PaymentSheet.tsx'
with io.open(path, 'r', encoding='utf-8') as f:
    lines = f.read().splitlines()

# Fix imports
for i, line in enumerate(lines):
    if line.startswith("import { ReceiptContent, PaymentMethodCard, SplitPaymentCard, Numpad } from './POSComponents';"):
        lines[i] = "import { ReceiptContent, PaymentMethodCard, SplitPaymentCard, Numpad } from '../../orders/POSComponents';\nimport Portal from '@/components/Portal';\nimport BottomSheet from '@/components/BottomSheet';\nimport { useMediaQuery } from '@/components/erp/hooks';"
        break

# Rename PaymentModal
for i, line in enumerate(lines):
    if line.startswith("const PaymentModal = ({"):
        lines[i] = "const PaymentSheet = ({"
        break

for i, line in enumerate(lines):
    if line.startswith("}: PaymentModalProps) => {"):
        lines[i] = "}: PaymentModalProps) => {"
        if lines[i+1].strip() == "const { toast } = useToast();":
            lines[i+1] = "    const isMobile = useMediaQuery('(max-width: 768px)');\n    const { toast } = useToast();"
        break

for i, line in enumerate(lines):
    if line.startswith("export default PaymentModal;"):
        lines[i] = "export default PaymentSheet;"
        break

# Find boundaries
return_start_idx = -1
right_col_start_idx = -1
mobile_receipt_start_idx = -1

for i, line in enumerate(lines):
    if line.strip() == "return (" and "z-[60]" in "".join(lines[i:i+5]):
        return_start_idx = i
    if line.strip() == "{/* --- RIGHT COLUMN: PAYMENT INPUTS --- */}":
        right_col_start_idx = i
    if line.strip() == "{/* --- MOBILE BOTTOM SHEET RECEIPT --- */}":
        mobile_receipt_start_idx = i

if return_start_idx != -1 and right_col_start_idx != -1 and mobile_receipt_start_idx != -1:
    # Build the new content
    new_lines = lines[:return_start_idx]
    
    # Start SheetContent definition
    new_lines.append("    const SheetContent = (")
    new_lines.append("        <div className=\"flex flex-col h-full bg-white dark:bg-dark-surface relative w-full pointer-events-auto\">")
    
    # Add header (we recreate the original PaymentModal views header here but without the shrink-0)
    new_lines.extend([
        '            {/* Header */}',
        '            <div className="flex items-center justify-between p-4 md:p-6 border-b border-brand-border dark:border-dark-border">',
        '                <div className="flex items-center gap-3">',
        "                    {view !== 'methods' && paymentStatus !== 'success' && (",
        '                        <button onClick={handleGoBack} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-dark-border/50 text-brand-dark dark:text-dark-heading">',
        '                            <ChevronLeftIcon size={24} />',
        '                        </button>',
        '                    )}',
        '                    <div>',
        '                        <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">{getTitle()}</h2>',
        "                        {customer?.name && paymentStatus !== 'success' && (",
        '                            <p className="text-sm text-brand-inactive-text">{headerSubtitle}: {customer.name}</p>',
        '                        )}',
        '                    </div>',
        '                </div>',
        "                {paymentStatus !== 'success' && (",
        '                    <button onClick={handleSafeClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-dark-border/50 text-brand-inactive-text">',
        '                        <XIcon size={24} />',
        '                    </button>',
        '                )}',
        '            </div>',
        '            {/* Body content based on views... */}',
        '            <div className="flex-1 overflow-y-auto overflow-x-hidden relative custom-scrollbar bg-gray-50 dark:bg-dark-background">'
    ])
    
    # Now we need to extract the views content. The views content is inside the Right Column -> Content Area.
    # In PaymentModal.tsx, under Right Column, there is an if statement for Header, then Content Area
    content_area_start_idx = -1
    for i in range(right_col_start_idx, mobile_receipt_start_idx):
        if lines[i].strip() == "{/* Content Area */}":
            content_area_start_idx = i
            break
    
    if content_area_start_idx != -1:
        # We take lines from content_area_start_idx + 2 (to skip the div and the comment) 
        # up to mobile_receipt_start_idx, but we must also stop BEFORE the '</div>' of the Content Area.
        # Wait, the Right Column has: Header, Content Area, Fixed Bottom Bar.
        # We need ALL OF IT except the Header!
        
        # We'll skip the old Header logic which starts around right_col_start_idx
        header_end_idx = -1
        for i in range(right_col_start_idx, content_area_start_idx):
            if lines[i].strip() == ")}":
                header_end_idx = i
        
        if header_end_idx != -1:
            # Append everything from after the old header up to mobile_receipt_start_idx
            # Wait, the Content Area div needs to be ignored because we created our own.
            # No, we can just include the original Content Area div! 
            # Our new_lines already created the SheetContent wrapper, the Header, and the views wrapper.
            # Let's NOT create the views wrapper in new_lines, and instead just include the original Content Area div.
            
            # Let's undo the views wrapper in new_lines
            new_lines = new_lines[:-2]
            
            # Append from the start of Content Area to mobile_receipt_start_idx
            # But wait, mobile_receipt_start_idx is followed by the closing of the Right Column.
            # So we append up to mobile_receipt_start_idx - 1 (which should be the end of Right Column content).
            
            # Find the closing tag of the Right Column before mobile_receipt
            # We'll just include everything from content_area_start_idx to mobile_receipt_start_idx - 1
            for i in range(content_area_start_idx, mobile_receipt_start_idx):
                new_lines.append(lines[i])
            
            # Now close the SheetContent
            new_lines.extend([
                '        </div>',
                '    );',
                '',
                '    if (!isOpen) return null;',
                '',
                '    if (isMobile) {',
                '        return (',
                '            <BottomSheet isOpen={isOpen} onClose={handleSafeClose}>',
                '                {SheetContent}',
                '            </BottomSheet>',
                '        );',
                '    }',
                '',
                '    return (',
                '        <Portal>',
                '            <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" onClick={handleSafeClose} />',
                '            <motion.div',
                "                initial={{ x: '100%', opacity: 0.5 }}",
                "                animate={{ x: 0, opacity: 1 }}",
                "                exit={{ x: '100%', opacity: 0.5 }}",
                '                transition={{ type: "spring", stiffness: 300, damping: 30 }}',
                '                className="fixed inset-y-0 right-0 z-[60] w-full max-w-md flex flex-col bg-white shadow-2xl dark:bg-dark-surface overflow-hidden pointer-events-auto"',
                '            >',
                '                {SheetContent}',
                '            </motion.div>',
                '        </Portal>',
                '    );',
                '};',
                ''
            ])
            
            with io.open(path, 'w', encoding='utf-8') as f:
                f.write('\n'.join(new_lines))
            print("SUCCESS")
        else:
            print("FAILED to find old header end")
    else:
        print("FAILED to find Content Area")
else:
    print("FAILED to find boundaries", return_start_idx, right_col_start_idx, mobile_receipt_start_idx)
