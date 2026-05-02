import io

path = r'c:\Users\MuriloSTR\Downloads\Dudit\components\erp\appointments\sheets\PaymentSheet.tsx'
with io.open(path, 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace('\r\n', '\n')

start_idx = c.find('    return (\n        <div className="fixed inset-0')
end_idx = c.find('    if (!isOpen) return null;')

if start_idx != -1 and end_idx != -1:
    right_col_start_str = '                {/* --- RIGHT COLUMN: PAYMENT INPUTS --- */}\n                <div className="w-full md:w-[60%] bg-white dark:bg-dark-surface flex flex-col relative h-full">\n'
    right_col_end_str = '                {/* --- MOBILE BOTTOM SHEET RECEIPT --- */}'
    
    rc_start_idx = c.find(right_col_start_str, start_idx)
    rc_end_idx = c.find(right_col_end_str, rc_start_idx)
    
    if rc_start_idx != -1 and rc_end_idx != -1:
        right_col_content = c[rc_start_idx + len(right_col_start_str):rc_end_idx]
        
        new_sheet_content = '    const SheetContent = (\n        <div className="flex flex-col h-full bg-white dark:bg-dark-surface relative w-full pointer-events-auto">\n' + right_col_content + '        </div>\n    );\n'
        
        c = c[:start_idx] + new_sheet_content + '\n' + c[end_idx:]
        
        with io.open(path, 'w', encoding='utf-8') as f:
            f.write(c)
        print('SUCCESS_REPLACEMENT')
    else:
        print('FAILED_RC', rc_start_idx, rc_end_idx)
else:
    print('FAILED_MAIN', start_idx, end_idx)
