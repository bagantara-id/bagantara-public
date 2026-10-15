// ==========================================
// FILE: chat/cloud-media.js
// FUNGSI: Transmisi Media Awan (Cloudinary) Murni (V8 ZERO HARDCODE)
// ==========================================

export async function uploadMediaKeCloudinary(fileBlob, tipeData = 'image') {
    const config = window.BGN_CONFIG?.settings?.cloudinary;
    if (!config || !config.cloud_name || !config.upload_preset || !config.api_base_url) {
        console.error("[MODUL MEDIA] Kredensial Cloudinary belum dimuat di settings.json.");
        return null;
    }

    const formData = new FormData();
    formData.append('file', fileBlob);
    formData.append('upload_preset', config.upload_preset);

    const endpointTipe = tipeData === 'audio' ? 'video' : 'image';
    const apiUrl = `${config.api_base_url}/${config.cloud_name}/${endpointTipe}/upload`;

    try {
        const respon = await fetch(apiUrl, { method: 'POST', body: formData });
        if (!respon.ok) throw new Error("Gagal mengunggah media");
        const data = await respon.json();
        return data.secure_url; 
    } catch (error) {
        console.error("[MODUL MEDIA] Kegagalan transmisi Cloudinary:", error);
        return null;
    }
}
