document.getElementById("convert-form").addEventListener("submit", async function(event) {
    event.preventDefault();

    let fileInput = document.getElementById("rawDNAFile").files[0];
    let formData = new FormData();
    formData.append("file", fileInput);

    let response = await fetch("/convert_dna", {
        method: "POST",
        body: formData
    });

    let result = await response.json();

    if (result.error) {
        alert("❌ Error: " + result.error);
    } else {
        alert("✅ Conversion successful! Download AI-readable data.");
        let downloadLink = document.createElement("a");
        downloadLink.href = "data:text/csv;charset=utf-8," + encodeURIComponent(result.ai_data);
        downloadLink.download = "converted_ai_data.csv";
        document.body.appendChild(downloadLink);
        downloadLink.click();
    }
});

// Handle AI-ready CSV file upload & predictions
document.getElementById("predict-form").addEventListener("submit", async function(event) {
    event.preventDefault();

    let fileInput = document.getElementById("csvFile").files[0];
    let formData = new FormData();
    formData.append("file", fileInput);

    let response = await fetch("/predict_csv", {
        method: "POST",
        body: formData
    });

    let result = await response.json();

    if (result.error) {
        alert("❌ Error: " + result.error);
        return;
    }

    let tableBody = document.querySelector("#results-table tbody");
    tableBody.innerHTML = "";  

    result.predictions.forEach(row => {
        let tr = document.createElement("tr");
        tr.innerHTML = `<td>${row.radius_mean}</td>
                        <td>${row.texture_mean}</td>
                        <td>${row.perimeter_mean}</td>
                        <td>${row.ami_repair_prediction.toFixed(5)}</td>
                        <td>${row.repair_mechanism}</td>`;
        tableBody.appendChild(tr);
    });
});