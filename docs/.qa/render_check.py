from pathlib import Path
from pypdf import PdfReader
from pdf2image import convert_from_path
folder=Path('docs/.qa/render')
pdf=PdfReader(folder/'proposal.pdf')
for i,page in enumerate(pdf.pages):
    text=page.extract_text()
    print(i+1,len(text),text[:85].replace('\n',' | '),text[-110:].replace('\n',' | '))
for i,image in enumerate(convert_from_path(str(folder/'proposal.pdf'),dpi=110)):
    image.save(folder/f'page-{i+1}.png')
