package com.meaningfulplushies.packingstation;
import java.util.*;
final class TrackingConfirmation {
 private String previous="";private long lastFrame=-1;
 static String code(String value){String v=value==null?"":value.toUpperCase(Locale.ROOT).replaceAll("[\\s-]","");return v.matches("[A-Z0-9]{6,40}")?v:"";}
 void reset(){previous="";lastFrame=-1;}
 boolean observe(List<String> values,String expected,long frame){if(frame==lastFrame)return false;lastFrame=frame;String target=code(expected);boolean match=!target.isEmpty()&&values.stream().anyMatch(v->code(v).equals(target));boolean confirmed=match&&previous.equals(target);previous=match?target:"";return confirmed;}
}
