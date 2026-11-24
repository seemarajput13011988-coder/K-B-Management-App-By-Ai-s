import { cloneElement, isValidElement, type ReactNode } from 'react';

export type Language = 'en' | 'hi' | 'gu';

const words: Record<string, [string, string]> = {
  'Network online':['नेटवर्क चालू है','નેટવર્ક ચાલુ છે'],'Home':['होम','હોમ'],'My Connection':['मेरा कनेक्शन','મારું કનેક્શન'],'Explore':['प्लान देखें','પ્લાન જુઓ'],'Support':['सहायता','સહાય'],'Account':['खाता','ખાતું'],'Connection':['कनेक्शन','કનેક્શન'],'Need help?':['मदद चाहिए?','મદદ જોઈએ છે?'],'Get support':['सहायता लें','સહાય મેળવો'],'Renew plan':['प्लान रिन्यू करें','પ્લાન રિન્યૂ કરો'],'Raise complaint':['शिकायत दर्ज करें','ફરિયાદ નોંધાવો'],'Payments':['पेमेंट','ચુકવણી'],'View bills & receipts':['बिल और रसीद देखें','બિલ અને રસીદ જુઓ'],'New connection':['नया कनेक्शन','નવું કનેક્શન'],'Connection overview':['कनेक्शन की जानकारी','કનેક્શનની વિગતો'],'Current plan':['मौजूदा प्लान','હાલનો પ્લાન'],'Renewal date':['रिन्यू करने की तारीख','રિન્યૂ કરવાની તારીખ'],'Usage this month':['इस महीने का इस्तेमाल','આ મહિનાનો ઉપયોગ'],'Popular plans':['लोकप्रिय प्लान','લોકપ્રિય પ્લાન'],'Explore all':['सभी प्लान देखें','બધા પ્લાન જુઓ'],'Explore plans':['प्लान देखें','પ્લાન જુઓ'],'Support centre':['सहायता केंद्र','સહાય કેન્દ્ર'],'Browse FAQs':['आम सवाल देखें','સામાન્ય પ્રશ્નો જુઓ'],'Search internet plans...':['इंटरनेट प्लान खोजें...','ઇન્ટરનેટ પ્લાન શોધો...'],'Recommended':['सुझाए गए','ભલામણ કરેલ'],'Price: low to high':['कम कीमत से ज़्यादा कीमत','ઓછી કિંમતથી વધુ કિંમત'],'Plan amount':['प्लान की कीमत','પ્લાનની કિંમત'],'Internet speed':['इंटरनेट की स्पीड','ઇન્ટરનેટની ઝડપ'],'Monthly data usage':['महीने का डेटा इस्तेमाल','માસિક ડેટાનો ઉપયોગ'],'Installation address':['इंस्टॉलेशन का पता','ઇન્સ્ટોલેશનનું સરનામું'],'Router / modem':['राउटर / मॉडेम','રાઉટર / મોડેમ'],'Subscription history':['सब्सक्रिप्शन हिस्ट्री','સબ્સ્ક્રિપ્શનનો ઇતિહાસ'],'Payments & bills':['पेमेंट और बिल','ચુકવણી અને બિલ'],'Fixed payment preview':['पेमेंट का डेमो','ચુકવણીનું ડેમો'],'Taxable value':['टैक्स योग्य राशि','કરપાત્ર રકમ'],'CGST · 9%':['CGST · 9%','CGST · 9%'],'SGST · 9%':['SGST · 9%','SGST · 9%'],'Fixed total payable':['कुल देय राशि','કુલ ચૂકવવાની રકમ'],'Total amount':['कुल राशि','કુલ રકમ'],'Print / Save invoice':['इनवॉइस प्रिंट / सेव करें','ઇન્વૉઇસ પ્રિન્ટ / સેવ કરો'],'Back to payment demo':['पेमेंट डेमो पर वापस जाएँ','ચુકવણીના ડેમો પર પાછા જાઓ'],'What happens next?':['इसके बाद क्या होगा?','આગળ શું થશે?'],'1. K&B checks coverage':['1. K&B कवरेज जाँचेगा','1. K&B કવરેજ તપાસશે'],'2. Team confirms final charges and appointment':['2. टीम अंतिम कीमत और समय बताएगी','2. ટીમ અંતિમ કિંમત અને સમયની પુષ્ટિ કરશે'],'3. Installation is scheduled after confirmation':['3. पुष्टि के बाद इंस्टॉलेशन तय होगा','3. પુષ્ટિ પછી ઇન્સ્ટોલેશન નક્કી થશે'],'Submit demo enquiry':['डेमो पूछताछ भेजें','ડેમો પૂછપરછ મોકલો'],'Request this plan':['यह प्लान माँगें','આ પ્લાન માટે વિનંતી કરો'],'Check availability':['उपलब्धता जाँचें','ઉપલબ્ધતા તપાસો'],'Review booking':['बुकिंग देखें','બુકિંગ તપાસો'],'Full name':['पूरा नाम','પૂરું નામ'],'Mobile number':['मोबाइल नंबर','મોબાઇલ નંબર'],'State':['राज्य','રાજ્ય'],'City':['शहर','શહેર'],'PIN code':['पिन कोड','પિન કોડ'],'Full address':['पूरा पता','પૂરું સરનામું'],'Additional requirements':['अतिरिक्त जानकारी','વધારાની માહિતી'],'Submit complaint':['शिकायत भेजें','ફરિયાદ મોકલો'],'Done':['हो गया','થઈ ગયું'],'Close policies':['नियम बंद करें','નિયમો બંધ કરો'],'Payment timing':['पेमेंट कब करना है?','ચુકવણી ક્યારે કરવી?'],'Pay after K&B confirms coverage, the final plan price and installation schedule.':['K&B द्वारा कवरेज, प्लान की अंतिम कीमत और इंस्टॉलेशन का समय बताने के बाद पेमेंट करें।','K&B કવરેજ, પ્લાનની અંતિમ કિંમત અને ઇન્સ્ટોલેશનનો સમય નક્કી કરે ત્યાર પછી ચુકવણી કરો.'],'Your payment request will appear in My Payments / Billing.':['आपका पेमेंट अनुरोध My Payments / Billing में दिखेगा।','તમારી ચુકવણીની વિનંતી My Payments / Billing વિભાગમાં દેખાશે.']
};

function translateNode(node: ReactNode, language: Language): ReactNode {
  if (typeof node === 'string') {
    const key = node.trim().replace(/\s+/g, ' ');
    const pair = words[key];
    if (!pair) return node;
    const lead = node.match(/^\s*/)?.[0] || '';
    const tail = node.match(/\s*$/)?.[0] || '';
    return lead + (language === 'hi' ? pair[0] : language === 'gu' ? pair[1] : key) + tail;
  }
  // Preserve original element hierarchy; never wrap array children in spans.
  if (Array.isArray(node)) return node.map(child => translateNode(child, language));
  if (!isValidElement(node)) return node;
  const props = node.props as Record<string, unknown>;
  const attrs: Record<string, unknown> = {};
  for (const key of ['placeholder', 'title', 'aria-label', 'alt']) {
    if (typeof props[key] === 'string') attrs[key] = translateNode(props[key] as string, language);
  }
  return cloneElement(node, attrs, translateNode(props.children as ReactNode, language));
}

export function LanguageLayer({ language, children }: { language: Language; children: ReactNode }) {
  if (language === 'en') return <>{children}</>;
  return <>{translateNode(children, language)}</>;
}