import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { code128Modules, code128UnitCount } from "./code128.ts";

/** 50 × 25 mm thermal labels, or a 3 × 8 grid on A4. Actual size printing. */
export async function nfcLabelsPdf(cards: Array<{id:number}>, format: "thermal" | "a4" = "thermal") {
  if(!cards.length || cards.length>1000) throw new Error("Choose between 1 and 1,000 cards.");
  const doc=await PDFDocument.create(), font=await doc.embedFont(StandardFonts.Helvetica);
  const mm=72/25.4, width=50*mm, height=25*mm;
  for(let i=0;i<cards.length;i++) {
    const page=format==="a4" ? i%24===0 ? doc.addPage([210*mm,297*mm]) : doc.getPages()[doc.getPageCount()-1] : doc.addPage([width,height]);
    const col=i%3,row=Math.floor(i%24/3);
    const x=format==="a4" ? (10+col*65)*mm : 0;
    const y=format==="a4" ? (297-12-(row+1)*34)*mm : 0;
    const label=`NFC-${cards[i].id}`, quiet=10, unit=(width-16)/(code128UnitCount(label)+quiet*2);
    page.drawText("MEANINGFUL PLUSHIES",{x:x+8,y:y+height-13,size:7,font});
    let at=x+8+quiet*unit;
    for(const segment of code128Modules(label)) {
      if(segment.black) page.drawRectangle({x:at,y:y+22,width:segment.width*unit,height:27,color:rgb(0,0,0)});
      at+=segment.width*unit;
    }
    page.drawText(label,{x:x+(width-font.widthOfTextAtSize(label,10))/2,y:y+8,size:10,font});
  }
  return doc.save();
}
