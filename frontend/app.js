import { getDatabase} from "firebase/database";
import {app} from "./firebase"

class FormSchemaGenerator {
    constructor() {
        this.API_BASE_URL = 'http://localhost:5000';
        this.currentSchema = [];
        this.currentFlow = null;
        this.currentMethod = 'csv';
        
        this.init();
    }
    
    init() {
        this.bindEvents();
        this.checkAPIStatus();
        this.setupFileUploads();
    }
    
    bindEvents() {
        // Method selection
        document.querySelectorAll('.method-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchMethod(e.currentTarget.dataset.method);
            });
        });
        
        // CSV Upload
        document.getElementById('loadCsvBtn').addEventListener('click', () => this.handleCsvUpload());
        document.getElementById('csvFile').addEventListener('change', (e) => {
            const fileName = e.target.files[0]?.name || '';
            document.getElementById('csvFileName').textContent = fileName ? `Selected: ${fileName}` : '';
        });
        
        // Google Sheet
        document.getElementById('loadGSheetBtn').addEventListener('click', () => this.handleGSheet());
        
        // Schema Editor
        document.getElementById('updateSchemaBtn').addEventListener('click', () => this.updateSchema());
        document.getElementById('backToInputBtn').addEventListener('click', () => this.showStep(1));
        
        // Outputs
        document.getElementById('buildFlowBtn').addEventListener('click', () => this.buildFlow());
        document.getElementById('downloadSchemaBtn').addEventListener('click', () => this.downloadJson('schema'));
        document.getElementById('downloadFlowBtn').addEventListener('click', () => this.downloadJson('flow'));
        
        // Modals
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => this.closeAllModals());
        });
        
        // Close modals on outside click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeAllModals();
            });
        });
    }
    
    setupFileUploads() {
        // Drag and drop for file uploads
        const fileLabels = document.querySelectorAll('.file-label');
        
        fileLabels.forEach(label => {
            label.addEventListener('dragover', (e) => {
                e.preventDefault();
                label.style.borderColor = '#6366f1';
                label.style.background = 'rgba(99, 102, 241, 0.05)';
            });
            
            label.addEventListener('dragleave', (e) => {
                e.preventDefault();
                label.style.borderColor = '';
                label.style.background = '';
            });
            
            label.addEventListener('drop', (e) => {
                e.preventDefault();
                label.style.borderColor = '';
                label.style.background = '';
                
                const file = e.dataTransfer.files[0];
                const input = label.querySelector('input[type="file"]');
                
                if (input) {
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    input.files = dataTransfer.files;
                    
                    // Trigger change event
                    input.dispatchEvent(new Event('change'));
                }
            });
        });
    }
    
    async checkAPIStatus() {
        try {
            const response = await fetch(`${this.API_BASE_URL}/api/health`);
            if (response.ok) {
                document.getElementById('apiStatus').className = 'status online';
                document.getElementById('apiStatus').innerHTML = '<i class="fas fa-circle"></i> API: Online';
            }
        } catch (error) {
            console.warn('API is not reachable');
            document.getElementById('apiStatus').className = 'status offline';
            document.getElementById('apiStatus').innerHTML = '<i class="fas fa-circle"></i> API: Offline';
        }
    }
    
    switchMethod(method) {
        this.currentMethod = method;
        
        // Update active button
        document.querySelectorAll('.method-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.method === method) {
                btn.classList.add('active');
            }
        });
        
        // Show corresponding section
        document.querySelectorAll('.input-section').forEach(section => {
            section.classList.remove('active');
        });
        
        document.getElementById(`${method}-section`).classList.add('active');
    }
    
    showStep(step) {
        document.getElementById('step1').style.display = step === 1 ? 'block' : 'none';
        document.getElementById('step2').style.display = step === 2 ? 'block' : 'none';
        document.getElementById('step3').style.display = step === 3 ? 'block' : 'none';
    }
    
    async handleCsvUpload() {
        const fileInput = document.getElementById('csvFile');
        const file = fileInput.files[0];
        
        if (!file) {
            this.showError('Please select a CSV file');
            return;
        }
        
        const formData = new FormData();
        formData.append('file', file);
        
        await this.loadWithLoader('loadCsvBtn', async () => {
            try {
                const response = await fetch(`${this.API_BASE_URL}/api/upload/csv`, {
                    method: 'POST',
                    body: formData
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    this.currentSchema = data.schema;
                    this.renderSchemaEditor();
                    this.showStep(2);
                    this.showSuccess('CSV file processed successfully!');
                } else {
                    this.showError(data.detail || data.error || 'Failed to process CSV file');
                }
            } catch (error) {
                this.showError('Failed to connect to server. Please check if the API is running.');
            }
        });
    }
    
    async handleGSheet() {
        const url = document.getElementById('sheetUrl').value.trim();
        
        if (!url) {
            this.showError('Please enter a Google Sheet URL');
            return;
        }
        
        await this.loadWithLoader('loadGSheetBtn', async () => {
            try {
                const response = await fetch(`${this.API_BASE_URL}/api/process/gsheet`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ url })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    this.currentSchema = data.schema;
                    this.renderSchemaEditor();
                    this.showStep(2);
                    this.showSuccess('Google Sheet processed successfully!');
                } else {
                    this.showError(data.detail || data.error || 'Failed to process Google Sheet');
                }
            } catch (error) {
                this.showError('Failed to connect to server. Please check if the API is running.');
            }
        });
    }
    
    renderSchemaEditor() {
        const editor = document.getElementById('schemaEditor');
        editor.innerHTML = '';
        
        this.currentSchema.forEach((field, index) => {
            const fieldElement = document.createElement('div');
            fieldElement.className = 'field-editor';
            fieldElement.innerHTML = `
                <div class="field-header">
                    <span class="field-title">Field ${index + 1}: ${field.label || field.field_name}</span>
                    <button class="toggle-btn" onclick="this.parentElement.nextElementSibling.style.display = this.parentElement.nextElementSibling.style.display === 'none' ? 'grid' : 'none'">
                        <i class="fas fa-chevron-down"></i>
                    </button>
                </div>
                <div class="field-form" style="display: grid;">
                    <div class="form-group">
                        <label>Label</label>
                        <input type="text" class="field-label" data-index="${index}" value="${field.label || ''}">
                    </div>
                    <div class="form-group">
                        <label>Input Type</label>
                        <select class="field-type" data-index="${index}">
                            <option value="text" ${field.input_type === 'text' ? 'selected' : ''}>Text</option>
                            <option value="number" ${field.input_type === 'number' ? 'selected' : ''}>Number</option>
                            <option value="email" ${field.input_type === 'email' ? 'selected' : ''}>Email</option>
                            <option value="date" ${field.input_type === 'date' ? 'selected' : ''}>Date</option>
                            <option value="select" ${field.input_type === 'select' ? 'selected' : ''}>Select</option>
                            <option value="textarea" ${field.input_type === 'textarea' ? 'selected' : ''}>Textarea</option>
                        </select>
                    </div>
                    <div class="form-group" id="options-${index}" style="${field.input_type === 'select' ? '' : 'display: none;'}">
                        <label>Options (comma separated)</label>
                        <input type="text" class="field-options" data-index="${index}" value="${field.options?.join(', ') || ''}">
                    </div>
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: 8px;">
                            <input type="checkbox" class="field-required" data-index="${index}" ${field.required ? 'checked' : ''}>
                            Required
                        </label>
                    </div>
                    <div class="form-group">
                        <label>Validation Rule</label>
                        <input type="text" class="field-validation" data-index="${index}" value="${field.validation || ''}">
                    </div>
                </div>
            `;
            editor.appendChild(fieldElement);
            
            // Add event listener for type change
            const typeSelect = fieldElement.querySelector('.field-type');
            typeSelect.addEventListener('change', (e) => {
                const optionsDiv = document.getElementById(`options-${index}`);
                optionsDiv.style.display = e.target.value === 'select' ? 'block' : 'none';
            });
        });
    }
    
    async updateSchema() {
        // Collect updated field data
        const updatedSchema = this.currentSchema.map((field, index) => {
            return {
                ...field,
                label: document.querySelector(`.field-label[data-index="${index}"]`)?.value || field.label,
                input_type: document.querySelector(`.field-type[data-index="${index}"]`)?.value || field.input_type,
                options: document.querySelector(`.field-options[data-index="${index}"]`)?.value
                    ?.split(',')
                    .map(opt => opt.trim())
                    .filter(opt => opt) || field.options,
                required: document.querySelector(`.field-required[data-index="${index}"]`)?.checked || false,
                validation: document.querySelector(`.field-validation[data-index="${index}"]`)?.value || field.validation
            };
        });
        
        await this.loadWithLoader('updateSchemaBtn', async () => {
            try {
                const response = await fetch(`${this.API_BASE_URL}/api/update/schema`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ schema: updatedSchema })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    this.currentSchema = data.schema;
                    this.renderSchemaOutput();
                    this.showStep(3);
                    this.showSuccess('Schema updated successfully!');
                } else {
                    this.showError(data.detail || data.error || 'Failed to update schema');
                }
            } catch (error) {
                this.showError('Failed to connect to server. Please check if the API is running.');
            }
        });
    }
    
    renderSchemaOutput() {
        const schemaJson = document.getElementById('schemaJson');
        
        // Ensure schema is displayed in a readable format
        const formattedSchema = this.currentSchema.map(field => ({
            "field_name": field.field_name,
            "label": field.label,
            "input_type": field.input_type,
            "required": field.required,
            "options": field.options || [],
            "validation": field.validation || ""
        }));
        
        schemaJson.textContent = JSON.stringify(formattedSchema, null, 2);
        this.highlightJson(schemaJson);
    }
    
    async buildFlow() {
        if (!this.currentSchema || this.currentSchema.length === 0) {
            this.showError('No schema available. Please generate a schema first.');
            return;
        }
        
        await this.loadWithLoader('buildFlowBtn', async () => {
            try {
                const response = await fetch(`${this.API_BASE_URL}/api/generate/flow`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ 
                        schema: this.currentSchema,
                        flow_id: 'generated_form'
                    })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    this.currentFlow = data.flow;
                    this.renderFlowOutput();
                    document.getElementById('downloadFlowBtn').style.display = 'inline-flex';
                    this.showSuccess('Conversational flow generated successfully!');
                } else {
                    this.showError(data.detail || data.error || 'Failed to generate flow');
                }
            } catch (error) {
                this.showError('Failed to connect to server. Please check if the API is running.');
            }
        });
    }
    
    renderFlowOutput() {
        const flowJson = document.getElementById('flowJson');
        
        // Re-order the flow object for display
        const formattedFlow = {
            "flow_id": this.currentFlow.flow_id,
            "total_steps": this.currentFlow.total_steps,
            "steps": this.currentFlow.steps.map(step => ({
                "step": step.step,
                "field_name": step.field_name,
                "question": step.question,
                "input_type": step.input_type,
                "required": step.required,
                "options": step.options,
                "validation": step.validation
            })),
            "completion_message": this.currentFlow.completion_message
        };
        
        flowJson.textContent = JSON.stringify(formattedFlow, null, 2);
        this.highlightJson(flowJson);
    }
    
    highlightJson(preElement) {
        const jsonString = preElement.textContent;
        const highlighted = jsonString
            .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, match => {
                let cls = 'number';
                if (/^"/.test(match)) {
                    if (/:$/.test(match)) {
                        cls = 'key';
                    } else {
                        cls = 'string';
                    }
                } else if (/true|false/.test(match)) {
                    cls = 'boolean';
                } else if (/null/.test(match)) {
                    cls = 'null';
                }
                return `<span class="${cls}">${match}</span>`;
            });
        
        preElement.innerHTML = highlighted;
        
        // Add CSS for syntax highlighting if not already present
        if (!document.getElementById('json-highlight-styles')) {
            const style = document.createElement('style');
            style.id = 'json-highlight-styles';
            style.textContent = `
                .string { color: #ce9178; }
                .number { color: #b5cea8; }
                .boolean { color: #569cd6; }
                .null { color: #569cd6; }
                .key { color: #9cdcfe; }
            `;
            document.head.appendChild(style);
        }
    }
    
    downloadJson(type) {
        let data, filename;
        
        if (type === 'schema') {
            data = this.currentSchema;
            filename = 'form_schema.json';
        } else if (type === 'flow') {
            // Re-order the flow object before downloading
            data = {
                "flow_id": this.currentFlow.flow_id,
                "total_steps": this.currentFlow.total_steps,
                "steps": this.currentFlow.steps.map(step => ({
                    "step": step.step,
                    "field_name": step.field_name,
                    "question": step.question,
                    "input_type": step.input_type,
                    "required": step.required,
                    "options": step.options,
                    "validation": step.validation
                })),
                "completion_message": this.currentFlow.completion_message
            };
            filename = 'form_flow.json';
        } else {
            return;
        }
        
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    async loadWithLoader(buttonId, callback) {
        const button = document.getElementById(buttonId);
        const icon = button.querySelector('.fa-spinner');
        const text = button.querySelector('span');
        
        // Show spinner
        icon.classList.remove('d-none');
        button.disabled = true;
        
        try {
            await callback();
        } catch (error) {
            console.error('Error:', error);
            this.showError('An unexpected error occurred');
        } finally {
            // Hide spinner
            icon.classList.add('d-none');
            button.disabled = false;
        }
    }
    
    showError(message) {
        document.getElementById('errorMessage').textContent = message;
        document.getElementById('errorModal').classList.add('active');
    }
    
    showSuccess(message) {
        document.getElementById('successMessage').textContent = message;
        document.getElementById('successModal').classList.add('active');
    }
    
    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new FormSchemaGenerator();
});