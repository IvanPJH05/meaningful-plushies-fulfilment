package com.meaningfulplushies.packingstation;

import java.util.ArrayDeque;

/** HID scans belong to the station, not whichever button last had focus. */
final class ScannerInput {
    private final StringBuilder text=new StringBuilder();
    private final ArrayDeque<String> pending=new ArrayDeque<>();
    private boolean overflow;
    void append(int codePoint){if(Character.isISOControl(codePoint))return;if(text.length()+Character.charCount(codePoint)>512){overflow=true;return;}if(!overflow)text.appendCodePoint(codePoint);}
    String text(){return text.toString();}
    boolean hasText(){return text.length()>0||overflow;}
    String finish(){String value=overflow?"":text.toString().trim();clearText();return value;}
    void clearText(){text.setLength(0);overflow=false;}
    void enqueue(String code){if(pending.size()>=8){pending.clear();throw new IllegalStateException("Too many waiting scans. Scan the next order and NFC card again.");}pending.addLast(code);}
    String poll(){return pending.pollFirst();}
    int waiting(){return pending.size();}
    void reset(){clearText();pending.clear();}
}
