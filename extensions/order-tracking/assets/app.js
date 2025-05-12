document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('order-tracking-form');
  const resultDiv = document.getElementById('tracking-result');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const orderNumber = document.getElementById('order-number').value;
    const email = document.getElementById('email').value;
    let shop = window.Shopify && window.Shopify.shop;
    if (!shop) {
      shop = prompt('Please enter your shop domain (e.g. mystore.myshopify.com):');
      if (!shop) {
        displayTrackingResult({ message: 'Shop domain is required.' }, false);
        return;
      }
    }

    // Get the current URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const hmac = urlParams.get('hmac');
    
    try {
      // Use relative path for app proxy
      const response = await fetch(`/apps/track-order?shop=${encodeURIComponent(shop)}&hmac=${hmac}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ orderNumber, email }),
        credentials: 'include'
      });

      const data = await response.json();
      
      if (response.ok) {
        displayTrackingResult(data, true);
      } else {
        displayTrackingResult(data, false);
      }
    } catch (error) {
      console.error('Error:', error);
      displayTrackingResult({ message: 'An error occurred. Please try again.' }, false);
    }
  });

  function displayTrackingResult(data, isSuccess) {
    resultDiv.style.display = 'block';
    resultDiv.className = `tracking-result ${isSuccess ? 'success' : 'error'}`;
    
    if (isSuccess && data.trackingInfo) {
      resultDiv.innerHTML = `
        <h3>Order Status</h3>
        <div class="tracking-info">
          <p>${data.message}</p>
          ${data.trackingInfo.trackingNumber ? `
            <p>Tracking Number: ${data.trackingInfo.trackingNumber}</p>
            <a href="${data.trackingInfo.trackingUrl}" target="_blank" class="tracking-link">
              Track Package
            </a>
          ` : ''}
        </div>
      `;
    } else {
      resultDiv.innerHTML = `
        <h3>Order Status</h3>
        <div class="tracking-info">
          <p>${data.message}</p>
        </div>
      `;
    }
  }
}); 