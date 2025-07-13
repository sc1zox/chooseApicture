import { Handler } from '@netlify/functions'

export const handler: Handler = async (event: { httpMethod: string; body: any; }) => {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  // GET Request - Bestellungen aus Netlify Forms abrufen
  if (event.httpMethod === 'GET') {
    try {
      // Netlify Forms API aufrufen
      const netlifyApiUrl = `https://api.netlify.com/api/v1/sites/${process.env.NETLIFY_SITE_ID}/forms`;
      
      const formsResponse = await fetch(netlifyApiUrl, {
        headers: {
          'Authorization': `Bearer ${process.env.NETLIFY_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      if (!formsResponse.ok) {
        throw new Error(`Netlify API Fehler: ${formsResponse.status}`);
      }

      const forms = await formsResponse.json();
      const ordersForm = forms.find((form: any) => form.name === 'orders');
      
      if (!ordersForm) {
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            orders: [],
            totalOrders: 0,
            imageStats: {},
            lastUpdated: new Date().toISOString()
          })
        };
      }

      // Submissions für das orders Formular abrufen
      const submissionsResponse = await fetch(`https://api.netlify.com/api/v1/sites/${process.env.NETLIFY_SITE_ID}/forms/${ordersForm.id}/submissions`, {
        headers: {
          'Authorization': `Bearer ${process.env.NETLIFY_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      if (!submissionsResponse.ok) {
        throw new Error(`Submissions API Fehler: ${submissionsResponse.status}`);
      }

      const submissions = await submissionsResponse.json();
      
      // Bildstatistiken berechnen
      const imageStats: { [key: string]: { count: number; title: string } } = {};
      
      // Submissions in Order-Format umwandeln
      const orders = submissions.map((submission: any) => {
        const data = submission.data;
        const createdAt = new Date(submission.created_at);
        
        const selectedImage = data['selected-image'] ? parseInt(data['selected-image']) : null;
        const selectedImageDetails = data['selected-image-details'] ? JSON.parse(data['selected-image-details']) : null;
        
        // Bildstatistiken aktualisieren
        if (selectedImage && selectedImageDetails) {
          const imageId = selectedImage.toString();
          if (!imageStats[imageId]) {
            imageStats[imageId] = {
              count: 0,
              title: selectedImageDetails.title || `Bild ${selectedImage}`
            };
          }
          imageStats[imageId].count++;
        }
        
        return {
          id: submission.id,
          orderNumber: data['order-number'] || `ORD-${submission.number}`,
          email: data.email || '',
          selectedImage: selectedImage,
          selectedImageDetails: selectedImageDetails,
          timestamp: submission.created_at,
          formattedDate: createdAt.toLocaleString('de-DE'),
          netlifyId: submission.id
        };
      });

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          orders: orders,
          totalOrders: orders.length,
          imageStats: imageStats,
          lastUpdated: new Date().toISOString()
        })
      };

    } catch (error) {
      console.error('Error fetching orders:', error);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Fehler beim Laden der Bestellungen',
          details: error.message 
        })
      };
    }
  }

  // POST Request - Bestellung erstellen
  if (event.httpMethod === 'POST') {
    try {
      const data = JSON.parse(event.body || '{}');

      if (!data.email || !data.selectedImage) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Fehlende erforderliche Daten' })
        };
      }

      const orderNumber = `ORD-${Date.now().toString().slice(-8).toUpperCase()}`;
      const order = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        email: data.email,
        selectedImage: data.selectedImage,
        selectedImageDetails: data.selectedImageDetails || {},
        orderNumber: orderNumber
      };

      // Netlify Forms Submission
      const formData = new FormData();
      formData.append('form-name', 'orders');
      formData.append('email', order.email);
      formData.append('selected-image', order.selectedImage.toString());
      formData.append('selected-image-details', JSON.stringify(order.selectedImageDetails));
      formData.append('order-number', order.orderNumber);

      const netlifyResponse = await fetch(`${process.env.URL}/`, {
        method: 'POST',
        body: formData
      });

      if (!netlifyResponse.ok) {
        throw new Error('Fehler beim Speichern der Bestellung');
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          message: 'Bestellung erfolgreich eingereicht',
          orderNumber: order.orderNumber
        })
      };

    } catch (error) {
      console.error('Error:', error);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Interner Serverfehler' })
      };
    }
  }

  return {
    statusCode: 405,
    headers: corsHeaders,
    body: JSON.stringify({ error: 'Method Not Allowed' })
  };
};