// ==========================================
// FILE: chat/cloud-media.js
// FUNGSI: Transmisi Media Awan (Cloudinary) Murni (OTA READY)
// ==========================================

export async function uploadMediaKeCloudinary(fileBlob, tipeData = 'image') {
    // Menarik kredensial dari RAM secara Real-Time (Mencegah Hardcode)
    const config = window.BGN_CONFIG?.settings?.cloudinary;
    if (!config) {
        console.error("[MODUL MEDIA] Kredensial Cloudinary belum dimuat.");
        return null;
    }

    const formData = new FormData();
    formData.append('file', fileBlob);
    formData.append('upload_preset', config.upload_preset);

    const endpointTipe = tipeData === 'audio' ? 'video' : 'image';
    const apiUrl = `https://api.cloudinary.com/v1_1/${config.cloud_name}/${endpointTipe}/upload`;

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
