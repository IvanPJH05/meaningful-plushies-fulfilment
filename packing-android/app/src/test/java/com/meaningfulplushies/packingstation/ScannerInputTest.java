package com.meaningfulplushies.packingstation;
import org.junit.Test;
import static org.junit.Assert.*;
public class ScannerInputTest {
    private String scan(ScannerInput input,String code){code.codePoints().forEach(input::append);return input.finish();}
    @Test public void consecutiveOrderAndNfcScansLoseNoCharacters(){ScannerInput input=new ScannerInput();assertEquals("MPI-2082",scan(input,"MPI-2082"));assertEquals("NFC-100331",scan(input,"NFC-100331"));assertFalse(input.hasText());}
    @Test public void scansDuringVideoSavingRemainInOrder(){ScannerInput input=new ScannerInput();input.enqueue(scan(input,"MPI-2083"));input.enqueue(scan(input,"NFC-100332"));assertEquals("MPI-2083",input.poll());assertEquals("NFC-100332",input.poll());assertNull(input.poll());}
    @Test public void duplicatePhysicalScansAreNotSilentlyDeduplicated(){ScannerInput input=new ScannerInput();input.enqueue("MPI-2082");input.enqueue("MPI-2082");assertEquals(input.poll(),input.poll());}
    @Test public void cancellationClearsPendingScansAndPartialBarcode(){ScannerInput input=new ScannerInput();input.enqueue("MPI-2082");input.append('N');input.reset();assertNull(input.poll());assertFalse(input.hasText());}
    @Test public void oversizedBarcodeNeverBecomesATruncatedValidOrder(){ScannerInput input=new ScannerInput();for(int i=0;i<513;i++)input.append('1');assertEquals("",input.finish());assertEquals("NFC-100331",scan(input,"NFC-100331"));}
    @Test public void queueOverflowFailsClosed(){ScannerInput input=new ScannerInput();for(int i=0;i<8;i++)input.enqueue("MPI-"+i);try{input.enqueue("NFC-100331");fail();}catch(IllegalStateException expected){}assertNull(input.poll());}
}
