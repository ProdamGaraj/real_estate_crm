import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Typography,
  Button,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  Alert,
  CircularProgress,
  Stack,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDepartments, getCompanies, type Department, type Company } from '../../api/permissions';
import DepartmentForm from '../../components/permissions/DepartmentForm';
import AddIcon from '@mui/icons-material/Add';
import AccountTreeIcon from '@mui/icons-material/AccountTree';

// Функция для построения дерева отделов
function buildDepartmentTree(departments: Department[]): Department[] {
  const map = new Map<number, Department>();
  const roots: Department[] = [];

  // Создаем копии с пустым массивом children
  departments.forEach((dept) => {
    map.set(dept.id, { ...dept, children: [] });
  });

  // Строим дерево
  departments.forEach((dept) => {
    const node = map.get(dept.id)!;
    if (dept.parent_department) {
      const parent = map.get(dept.parent_department);
      if (parent) {
        parent.children!.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  });

  return roots;
}

// Компонент для отображения узла дерева
interface DepartmentTreeNodeProps {
  department: Department;
  onEdit: (dept: Department) => void;
  t: (key: string) => string;
}

function DepartmentTreeNode({ department, onEdit, t }: DepartmentTreeNodeProps) {
  return (
    <TreeItem
      itemId={String(department.id)}
      label={
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            py: 0.5,
            cursor: 'pointer',
          }}
          onClick={(e) => {
            e.stopPropagation();
            onEdit(department);
          }}
        >
          <AccountTreeIcon fontSize="small" color="primary" />
          <Typography variant="body1">{department.name}</Typography>
          {department.code && (
            <Chip label={department.code} size="small" variant="outlined" />
          )}
          {!department.is_active && (
            <Chip label={t('pages.settings.permissions.inactive_status')} size="small" color="default" />
          )}
        </Box>
      }
    >
      {department.children?.map((child: Department) => (
        <DepartmentTreeNode key={child.id} department={child} onEdit={onEdit} t={t} />
      ))}
    </TreeItem>
  );
}

export default function DepartmentsPage() {
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<number | ''>('');
  const [editingDepartment, setEditingDepartment] = useState<Department | undefined>();
  const queryClient = useQueryClient();

  const { data: companies } = useQuery({
    queryKey: ['companies'],
    queryFn: () => getCompanies(),
  });

  const { data: departments, isLoading, isError, error } = useQuery({
    queryKey: ['departments', selectedCompany],
    queryFn: () =>
      getDepartments(selectedCompany ? { company: Number(selectedCompany) } : {}),
  });

  const handleSuccess = () => {
    setIsModalOpen(false);
    setEditingDepartment(undefined);
    queryClient.invalidateQueries({ queryKey: ['departments'] });
  };

  const handleEdit = (dept: Department) => {
    setEditingDepartment(dept);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setEditingDepartment(undefined);
    setIsModalOpen(true);
  };

  const departmentTree = departments ? buildDepartmentTree(departments) : [];

  return (
    <Stack spacing={3}>
      {/* Заголовок */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            {t('pages.settings.permissions.departments_title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('pages.settings.permissions.departments_subtitle')}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleCreate}
          disabled={!selectedCompany}
        >
          {t('pages.settings.permissions.create_department')}
        </Button>
      </Box>

      {/* Фильтры */}
      <Paper sx={{ p: 2 }}>
        <Box sx={{ maxWidth: 400 }}>
          <FormControl fullWidth size="small">
            <InputLabel>{t('common.company')}</InputLabel>
            <Select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value as number | '')}
              label={t('common.company')}
            >
              <MenuItem value="">
                <em>{t('pages.settings.permissions.all_companies')}</em>
              </MenuItem>
              {companies?.map((company: Company) => (
                <MenuItem key={company.id} value={company.id}>
                  {company.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </Paper>

      {/* Дерево отделов */}
      <Paper sx={{ p: 2 }}>
        {isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {t('errors.load_error')}: {error instanceof Error ? error.message : t('errors.unknown_error')}
          </Alert>
        )}

        {!selectedCompany && (
          <Alert severity="info">
            {t('pages.settings.permissions.select_company_for_departments')}
          </Alert>
        )}

        {selectedCompany && isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        )}

        {selectedCompany && !isLoading && departments && departments.length === 0 && (
          <Alert severity="info">
            {t('pages.settings.permissions.no_departments')}
          </Alert>
        )}

        {selectedCompany && !isLoading && departmentTree.length > 0 && (
          <SimpleTreeView sx={{ flexGrow: 1, overflowY: 'auto' }}>
            {departmentTree.map((dept) => (
              <DepartmentTreeNode key={dept.id} department={dept} onEdit={handleEdit} t={t} />
            ))}
          </SimpleTreeView>
        )}
      </Paper>

      {/* Модальное окно создания/редактирования */}
      <Dialog
        open={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingDepartment(undefined);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {editingDepartment ? t('pages.settings.permissions.edit_department') : t('pages.settings.permissions.create_department')}
        </DialogTitle>
        <DialogContent>
          <DepartmentForm
            department={editingDepartment}
            companyId={selectedCompany ? Number(selectedCompany) : undefined}
            onSuccess={handleSuccess}
            onCancel={() => {
              setIsModalOpen(false);
              setEditingDepartment(undefined);
            }}
          />
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
