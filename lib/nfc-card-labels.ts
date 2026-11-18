import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { code128Modules, code128UnitCount } from "./code128.ts";

export type NfcLabelFormat = "thermal" | "a4" | "camera" | "thermal-5x10";

export async function nfcLabelsPdf(cards: Array<{id:number}>, format: NfcLabelFormat = "thermal") {
  if(!cards.length || cards.length>1000) throw new Error("Choose between 1 and 1,000 cards.");
  const doc=await PDFDocument.create(), font=await doc.embedFont(StandardFonts.Helvetica);
  const largeThermal = format === "thermal-5x10";
  const singleLabel = format === "thermal" || largeThermal;
  const mm=72/25.4, width=(largeThermal?100:format==="camera"?80:50)*mm, height=(largeThermal?50:format==="camera"?36:25)*mm;
  const columns=format==="camera"?2:3, perPage=format==="camera"?12:24;
  for(let i=0;i<cards.length;i++) {
    const page=singleLabel ? doc.addPage([width,height])
      : i%perPage===0 ? doc.addPage([210*mm,297*mm]) : doc.getPages()[doc.getPageCount()-1];
    const col=i%columns,row=Math.floor((i%perPage)/columns);
    const x=singleLabel ? 0 : (10+col*(format==="camera"?95:65))*mm;
    const y=singleLabel ? 0 : (297-12-(row+1)*(format==="camera"?44:34))*mm;
    const label=`NFC-${cards[i].id}`, quiet=10, unit=(width-16)/(code128UnitCount(label)+quiet*2);
    page.drawText("MEANINGFUL PLUSHIES",{x:x+8,y:y+height-13,size:7,font});
    let at=x+8+quiet*unit;
    for(const segment of code128Modules(label)) {
      if(segment.black) page.drawRectangle({x:at,y:y+22,width:segment.width*unit,height:largeThermal?height-48:format==="camera"?52:27,color:rgb(0,0,0)});
      at+=segment.width*unit;
    }
    page.drawText(label,{x:x+(width-font.widthOfTextAtSize(label,10))/2,y:y+8,size:10,font});
  }
  return doc.save();
}
