export const ugcConsent = "I confirm this is my own content and I have permission from anyone shown. I allow Meaningful Plushies to use this content on its website, social media and advertising.";
export const ugcVideoLimit = 50 * 1024 * 1024;
export function ugcVideoType(name: string, type: string, size: number) {
  const extensions: Record<string,string> = { mp4:"video/mp4",mov:"video/quicktime",webm:"video/webm" };
  const mime = extensions[name.split('.').pop()?.toLowerCase() || ''];
  if (!mime || type !== mime || !Number.isInteger(size) || size <= 0 || size > ugcVideoLimit) throw new Error("Choose an MP4, MOV or WebM video up to 50 MB.");
  return mime;
}
export function ugcCustomerDetails(body: Record<string,unknown>) {
  const text = (key:string,max:number,required=true) => {const value=typeof body[key]==='string'?(body[key] as string).trim():'';if((required&&!value)||value.length>max)throw new Error(`Check ${key.replace(/([A-Z])/g,' $1').toLowerCase()}.`);return value;};
  const customer_name=text('customerName',200),phone=text('phone',40),email=text('email',254),order_number=text('orderNumber',100),notes=text('notes',5000,false);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  if (phone.replace(/\D/g,'').length<8) throw new Error("Enter a valid phone number.");
  if(body.consent!==true)throw new Error("Please confirm permission to use your content.");
  return {customer_name,phone,email,order_number,notes,consent:true,consent_text:ugcConsent};
}
