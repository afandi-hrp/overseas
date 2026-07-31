sed -i 's/::-webkit-scrollbar       { width: 5px; height: 5px; }/::-webkit-scrollbar       { width: 8px; height: 14px; }/g' src/index.css
sed -i 's/::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 99px; }/::-webkit-scrollbar-thumb { background: #94A3B8; border-radius: 99px; border: 3px solid #F1F5F9; }\n::-webkit-scrollbar-thumb:hover { background: #64748B; }/g' src/index.css
