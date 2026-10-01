from pathlib import Path
p=Path('docs/.qa/create_proposal.py')
s=p.read_text(encoding='utf-8')
s=s.replace("path=out/'PMS_AI_Chat_and_Calling_Integration_Proposal.docx';", "for border in list(doc.styles.element.xpath('.//w:pBdr')) + list(doc.element.xpath('.//w:pBdr')):\n    border.getparent().remove(border)\nfor par in doc.paragraphs:\n    for textnode in par._p.xpath('.//w:t'):\n        if textnode.text and textnode.text.startswith('  Open'):\n            textnode.set(qn('xml:space'), 'preserve')\npath=out/'PMS_AI_Chat_and_Calling_Integration_Proposal.docx';")
s=s.replace("h('Delivery after approval')\nfor t in [", "h('Delivery after approval')\nfor step,t in enumerate([").replace("complete user acceptance testing and prepare deployment instructions.']:\n    p(t,'List Number')", "complete user acceptance testing and prepare deployment instructions.'],1):\n    p(f'Phase {step}  {t}')")
p.write_text(s,encoding='utf-8')
