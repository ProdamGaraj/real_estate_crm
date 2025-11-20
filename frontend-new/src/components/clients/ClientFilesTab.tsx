import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getClientFiles, uploadClientFile } from '../../api/clients';
import { useForm } from 'react-hook-form';
import {
    Box,
    Button,
    CircularProgress,
    Link as MuiLink,
    Paper,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';

interface ClientFilesTabProps {
    clientId: number;
}

type FormInputs = {
    file: FileList;
    comment: string;
};

const columns: GridColDef[] = [
    {
        field: 'file',
        headerName: 'Файл',
        flex: 1,
        renderCell: (params) => (
            <MuiLink href={params.value} target="_blank" rel="noopener noreferrer">
                Скачать
            </MuiLink>
        ),
    },
    { field: 'comment', headerName: 'Комментарий', flex: 2 },
    { field: 'uploaded_by', headerName: 'Кем загружен', flex: 1 },
    {
        field: 'uploaded_at',
        headerName: 'Дата загрузки',
        type: 'dateTime',
        flex: 1,
        valueGetter: (value) => new Date(value),
    },
];

export default function ClientFilesTab({ clientId }: ClientFilesTabProps) {
    const queryClient = useQueryClient();
    const { register, handleSubmit, reset } = useForm<FormInputs>();

    const { data: files, isLoading } = useQuery({
        queryKey: ['clientFiles', clientId],
        queryFn: () => getClientFiles(clientId),
    });

    const mutation = useMutation({
        mutationFn: (formData: FormData) => uploadClientFile({ clientId, formData }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['clientFiles', clientId] });
            queryClient.invalidateQueries({queryKey: ['client', String(clientId)]})
            reset();
        },
    });

    const onSubmit = (data: FormInputs) => {
        const formData = new FormData();
        if (data.file[0]) {
            formData.append('file', data.file[0]);
        }
        formData.append('comment', data.comment);
        mutation.mutate(formData);
    };

    return (
        <Stack spacing={3}>
            <Paper component="form" onSubmit={handleSubmit(onSubmit)} sx={{ p: 2 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                    Загрузить новый файл
                </Typography>
                <Stack spacing={2}>
                    <TextField
                        type="file"
                        InputLabelProps={{ shrink: true }}
                        required
                        {...register('file', { required: true })}
                    />
                    <TextField
                        label="Комментарий"
                        multiline
                        rows={2}
                        {...register('comment')}
                    />
                    <Box>
                        <Button type="submit" variant="contained" disabled={mutation.isPending}>
                            {mutation.isPending ? 'Загрузка...' : 'Загрузить'}
                        </Button>
                    </Box>
                </Stack>
            </Paper>

            <Box sx={{ height: 400, width: '100%' }}>
                {isLoading ? (
                    <CircularProgress />
                ) : (
                    <DataGrid rows={files || []} columns={columns} />
                )}
            </Box>
        </Stack>
    );
}